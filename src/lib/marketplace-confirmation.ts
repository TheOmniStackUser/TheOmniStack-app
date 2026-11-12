import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

export async function confirmMarketplaceShipment(
  orderId: string,
  companyId: string,
  carrier: string = 'HERMES'
): Promise<{ success: boolean; error?: string; alreadyShipped?: boolean }> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.companyId, companyId)))
    .limit(1)

  if (!order) {
    return { success: false, error: `Order '${orderId}' not found.` }
  }

  if (order.marketplace === 'manual') {
    await db
      .update(orders)
      .set({
        marketplaceConfirmationStatus: 'not_applicable',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
    return { success: true }
  }

  if (!order.trackingNumber) {
    return { success: false, error: `Order '${orderId}' has no tracking number.` }
  }

  const activeIntegrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, companyId),
        eq(marketplaceIntegrations.isActive, true)
      )
    )

  const integration = activeIntegrations.find((i) =>
    i.type === order.marketplace ||
    (i.type === 'mirakl_decathlon' && order.marketplace === 'Decathlon DE') ||
    (i.type === 'mirakl_custom' &&
      ((i.metadata as any)?.customName || '').toLowerCase() === order.marketplace.toLowerCase())
  )

  if (!integration) {
    const errorMsg = `No active marketplace integration found for '${order.marketplace}'.`
    await db
      .update(orders)
      .set({
        marketplaceConfirmationStatus: 'failed',
        marketplaceConfirmationError: errorMsg,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
    return { success: false, error: errorMsg }
  }

  try {
    const { getAdapterForIntegration } = await import('@/workers/marketplace-sync')
    const adapter = getAdapterForIntegration(integration)

    if (!adapter || typeof adapter.confirmShipment !== 'function') {
      const errorMsg = `Adapter for '${order.marketplace}' does not support automatic shipment confirmation.`
      await db
        .update(orders)
        .set({
          marketplaceConfirmationStatus: 'failed',
          marketplaceConfirmationError: errorMsg,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
      return { success: false, error: errorMsg }
    }

    const isOtto = order.marketplace === 'otto'
    const ottoReturnAddressCarrierId = isOtto
      ? (integration.metadata as any)?.returnAddressCarrierId
      : undefined
    const targetMarketplaceOrderId =
      (order.rawPayload as any)?.originalMarketplaceOrderId || order.marketplaceOrderId

    if (!targetMarketplaceOrderId) {
      const errorMsg = 'No marketplace order ID present on order.'
      await db
        .update(orders)
        .set({
          marketplaceConfirmationStatus: 'failed',
          marketplaceConfirmationError: errorMsg,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
      return { success: false, error: errorMsg }
    }

    console.log(
      `[MarketplaceConfirmation] Confirming shipment for order ${targetMarketplaceOrderId} on ${order.marketplace} with tracking ${order.trackingNumber} (${carrier})...`
    )

    await adapter.confirmShipment(
      targetMarketplaceOrderId,
      order.trackingNumber,
      carrier,
      order.returnTrackingNumber || undefined,
      order.rawPayload,
      isOtto ? ottoReturnAddressCarrierId : undefined
    )

    await db
      .update(orders)
      .set({
        marketplaceConfirmationStatus: 'confirmed',
        marketplaceConfirmationError: null,
        marketplaceConfirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))

    // Auto-generate invoice if enabled on this marketplace integration
    try {
      const { isAmazonSwitzerlandOrder } = await import('@/lib/orders')
      const autoInvoiceEnabledAt = (integration?.metadata as any)?.autoInvoiceEnabledAt
      const thresholdDate = autoInvoiceEnabledAt
        ? new Date(autoInvoiceEnabledAt)
        : new Date('2026-05-26T12:00:00Z')
      const isOrderNew = order.createdAt >= thresholdDate

      if (integration?.autoInvoice && isOrderNew && !isAmazonSwitzerlandOrder(order)) {
        const { createInvoiceForOrder } = await import('@/lib/invoice-service')
        const invResult = await createInvoiceForOrder(order.id, companyId)
        if (invResult && 'pdfBuffer' in invResult && integration.uploadInvoice) {
          if (adapter?.uploadInvoice) {
            await adapter.uploadInvoice(
              order.marketplaceOrderId,
              invResult.pdfBuffer,
              `${invResult.invoiceNumber}.pdf`
            )
          }
        }
      }
    } catch (invErr) {
      console.warn('[MarketplaceConfirmation] Auto-invoice check warning:', invErr)
    }

    // Auto-download marketplace invoice if enabled
    try {
      const downloadInvoice = !!(integration.metadata as any)?.downloadInvoice
      if (downloadInvoice) {
        const { downloadAndSaveMarketplaceInvoice } = await import('@/workers/marketplace-sync')
        await downloadAndSaveMarketplaceInvoice(order.id, companyId, adapter)
      }
    } catch (dlErr) {
      console.warn('[MarketplaceConfirmation] Auto-invoice download warning:', dlErr)
    }

    return { success: true }
  } catch (confirmErr: any) {
    const msg = confirmErr?.message ?? String(confirmErr)
    console.error(
      `[MarketplaceConfirmation] Failed to confirm ${order.marketplaceOrderId} on ${order.marketplace}:`,
      msg
    )

    const isAlreadyShipped =
      msg.toLowerCase().includes('bereits auf otto als versendet') ||
      msg.toLowerCase().includes('position_item_included_in_other_shipment') ||
      msg.toLowerCase().includes('already shipped') ||
      msg.toLowerCase().includes('already fulfilled') ||
      msg.toLowerCase().includes('is already fulfilled') ||
      msg.toLowerCase().includes("current status is 'shipped'") ||
      msg.toLowerCase().includes('current status is "shipped"')

    if (isAlreadyShipped) {
      console.log(
        `[MarketplaceConfirmation] Order ${order.marketplaceOrderId} was already marked as shipped on ${order.marketplace}. Marking confirmed.`
      )
      await db
        .update(orders)
        .set({
          marketplaceConfirmationStatus: 'confirmed',
          marketplaceConfirmationError: null,
          marketplaceConfirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
      return { success: true, alreadyShipped: true }
    } else {
      await db
        .update(orders)
        .set({
          marketplaceConfirmationStatus: 'failed',
          marketplaceConfirmationError: msg,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
      return { success: false, error: msg }
    }
  }
}

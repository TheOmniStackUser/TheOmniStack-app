'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function archiveOrderAction(orderId: string) {
  try {
    const auth = await requireAuth()

    await db
      .update(orders)
      .set({ isArchived: true })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    revalidatePath('/orders')
    return { success: true, message: 'Bestellung wurde erfolgreich gelöscht.' }
  } catch (error) {
    console.error('Error archiving order:', error)
    return { error: 'Fehler beim Löschen der Bestellung.' }
  }
}

import { inArray } from 'drizzle-orm'

export async function archiveOrdersBulkAction(orderIds: string[]) {
  try {
    const auth = await requireAuth()

    if (!orderIds || orderIds.length === 0) {
      return { error: 'Keine Bestellungen ausgewählt.' }
    }

    await db
      .update(orders)
      .set({ isArchived: true })
      .where(
        and(
          inArray(orders.id, orderIds),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    revalidatePath('/orders')
    return { success: true, message: `${orderIds.length} Bestellungen wurden erfolgreich gelöscht.` }
  } catch (error) {
    console.error('Error archiving orders:', error)
    return { error: 'Fehler beim Löschen der Bestellungen.' }
  }
}

export async function updateOrderStatusAction(orderId: string, status: any) {
  try {
    const auth = await requireAuth()

    if (status === 'invoiced') {
      const [currentOrder] = await db
        .select({ status: orders.status })
        .from(orders)
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.companyId, auth.activeCompanyId)
          )
        )
        .limit(1)

      if (currentOrder && currentOrder.status === 'shipped') {
        return { error: 'Der Status "versendet" darf nicht mit "invoiced" überschrieben werden.' }
      }
    }

    await db
      .update(orders)
      .set({ 
        status,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    revalidatePath('/orders')
    return { success: true, message: 'Status wurde aktualisiert.' }
  } catch (error) {
    console.error('Error updating order status:', error)
    return { error: 'Fehler beim Aktualisieren des Status.' }
  }
}

export async function updateOrderAddressAction(
  orderId: string,
  address: {
    shippingName: string
    shippingStreet: string
    shippingZip: string
    shippingCity: string
    shippingCountry: string
  }
) {
  try {
    const auth = await requireAuth()

    await db
      .update(orders)
      .set({
        shippingName: address.shippingName,
        shippingStreet: address.shippingStreet,
        shippingZip: address.shippingZip,
        shippingCity: address.shippingCity,
        shippingCountry: address.shippingCountry,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.companyId, auth.activeCompanyId)
        )
      )

    revalidatePath('/orders')
    return { success: true, message: 'Lieferadresse wurde erfolgreich aktualisiert.' }
  } catch (error) {
    console.error('Error updating order address:', error)
    return { error: 'Fehler beim Aktualisieren der Lieferadresse.' }
  }
}

export async function generateOrDownloadInvoicesBulkAction(orderIds: string[]) {
  try {
    const auth = await requireAuth()

    if (!orderIds || orderIds.length === 0) {
      return { error: 'Keine Bestellungen ausgewählt.' }
    }

    const { isNull, inArray } = await import('drizzle-orm')
    const { marketplaceIntegrations } = await import('@/db/schema/integrations')
    const { createInvoiceForOrder } = await import('@/lib/invoice-service')
    const { downloadAndSaveMarketplaceInvoice, getAdapterForIntegration } = await import('@/workers/marketplace-sync')

    // Fetch the candidate orders belonging to this company that don't have an invoice yet
    const candidateOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          inArray(orders.id, orderIds),
          eq(orders.companyId, auth.activeCompanyId),
          isNull(orders.invoiceId)
        )
      )

    if (candidateOrders.length === 0) {
      return { error: 'Keine der ausgewählten Bestellungen benötigt eine neue Rechnung.' }
    }

    let successCount = 0
    let errorCount = 0
    const errorsList: { orderNumber: string; error: string }[] = []

    // Fetch all integrations for the company once to avoid querying database in a loop
    const integrations = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.isActive, true)
        )
      )

    for (const order of candidateOrders) {
      const integration = integrations.find(i => 
        i.type === order.marketplace ||
        (i.type === 'mirakl_custom' && 
         ((i.metadata as any)?.customName || '').toLowerCase() === order.marketplace.toLowerCase())
      )

      if (!integration) {
        errorsList.push({ orderNumber: order.marketplaceOrderId, error: `Keine aktive Marktplatz-Integration für '${order.marketplace}' gefunden.` })
        errorCount++
        continue
      }

      const downloadInvoice = !!(integration.metadata as any)?.downloadInvoice
      const autoInvoice = !!integration.autoInvoice

      if (!downloadInvoice && !autoInvoice) {
        errorsList.push({ orderNumber: order.marketplaceOrderId, error: `Weder 'Auto-Rechnung' noch 'Auto-Download' ist für '${order.marketplace}' aktiv.` })
        errorCount++
        continue
      }

      const adapter = getAdapterForIntegration(integration)

      try {
        if (downloadInvoice) {
          if (adapter) {
            await downloadAndSaveMarketplaceInvoice(order.id, order.companyId, adapter)
            successCount++
          } else {
            errorsList.push({ orderNumber: order.marketplaceOrderId, error: 'Marktplatz-Schnittstelle (Adapter) konnte nicht initialisiert werden.' })
            errorCount++
          }
        } else if (autoInvoice) {
          const invResult = await createInvoiceForOrder(order.id, order.companyId)
          if (invResult && 'pdfBuffer' in invResult) {
            if (integration.uploadInvoice && adapter?.uploadInvoice) {
              try {
                await adapter.uploadInvoice(
                  order.marketplaceOrderId,
                  invResult.pdfBuffer,
                  `${invResult.invoiceNumber}.pdf`
                )
              } catch (uploadErr) {
                console.error(`[Bulk Invoices Action] Warning: Upload to marketplace failed for order ${order.marketplaceOrderId}:`, uploadErr)
              }
            }
            successCount++
          } else {
            const reason = (invResult && 'reason' in invResult) ? invResult.reason : 'Unbekannter Fehler bei der PDF-Erstellung'
            errorsList.push({ orderNumber: order.marketplaceOrderId, error: reason })
            errorCount++
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[Bulk Invoices Action] Error generating invoice for order ${order.marketplaceOrderId}:`, err)
        errorsList.push({ orderNumber: order.marketplaceOrderId, error: errMsg })
        errorCount++
      }
    }

    revalidatePath('/orders')

    return {
      success: errorCount === 0,
      successCount,
      errorCount,
      errorsList,
      message: `${successCount} Rechnung(en) erfolgreich erstellt/abgerufen.${errorCount > 0 ? ` Bei ${errorCount} Bestellung(en) sind Fehler aufgetreten.` : ''}`
    }
  } catch (error) {
    console.error('Error generating or downloading bulk invoices:', error)
    return { error: 'Fehler beim Erstellen/Abrufen der Rechnungen.' }
  }
}


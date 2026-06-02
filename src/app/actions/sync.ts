'use server'

import { requireAuth } from '@/lib/session'
import { marketplaceSyncQueue } from '@/workers/marketplace-sync'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { OttoAdapter } from '@/adapters/marketplace/otto'
import { MiraklAdapter } from '@/adapters/marketplace/mirakl'
import { AmazonAdapter } from '@/adapters/marketplace/amazon'
import { AboutYouAdapter } from '@/adapters/marketplace/aboutyou'
import { persistOrders } from '@/workers/marketplace-sync'
import type { NormalizedOrder } from '@/adapters/marketplace/base'

export async function triggerSyncAction() {
  const auth = await requireAuth()

  // Find all active integrations for this company, excluding shipping-only ones
  const activeIntegrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.isActive, true),
        sql`${marketplaceIntegrations.type} NOT IN ('dhl', 'hermes')`
      )
    )

  if (activeIntegrations.length === 0) {
    return { error: 'Es sind keine aktiven Marktplätze verknüpft.' }
  }

  // Enqueue a job for each active integration
  for (const integration of activeIntegrations) {
    await marketplaceSyncQueue.add(
      `sync-${integration.type}`, // Job Name
      {
        companyId: auth.activeCompanyId,
        marketplace: integration.type as any,
        triggeredByUserId: auth.userId,
        integrationId: integration.id,
      },
      {
        jobId: `sync-${integration.type}-${integration.id}-${auth.activeCompanyId}-${Date.now()}` // Prevent exact duplicates
      }
    )
  }

  revalidatePath('/dashboard')
  return { success: true, message: 'Synchronisation wurde im Hintergrund gestartet!' }
}

export async function triggerManualSyncAction(data: { marketplace: string, fromDate?: string, toDate?: string }) {
  const auth = await requireAuth()

  let query: any = and(
    eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
    eq(marketplaceIntegrations.isActive, true)
  )

  const allActiveIntegrations = await db.select().from(marketplaceIntegrations).where(query)

  let activeIntegrations = allActiveIntegrations
  if (data.marketplace !== 'all') {
    activeIntegrations = allActiveIntegrations.filter(integration => {
      if (data.marketplace === 'group_direct') {
        return ['otto', 'aboutyou', 'shopify', 'kaufland', 'ebay', 'amazon'].includes(integration.type)
      } else if (data.marketplace === 'group_decathlon') {
        const customName = ((integration.metadata as any)?.customName || '').toLowerCase()
        return integration.type === 'mirakl_decathlon' || integration.type === 'mirakl_decathlon_eu' || customName.startsWith('decathlon')
      } else if (data.marketplace === 'group_secret_sales') {
        const customName = ((integration.metadata as any)?.customName || '').toLowerCase()
        return customName.startsWith('secret sales')
      } else if (data.marketplace === 'group_other') {
        const customName = ((integration.metadata as any)?.customName || '').toLowerCase()
        const isDecathlon = integration.type === 'mirakl_decathlon' || integration.type === 'mirakl_decathlon_eu' || customName.startsWith('decathlon')
        const isSecretSales = customName.startsWith('secret sales')
        const isDirect = ['otto', 'aboutyou', 'shopify', 'kaufland', 'ebay', 'amazon'].includes(integration.type)
        return !isDecathlon && !isSecretSales && !isDirect
      } else if (data.marketplace.startsWith('mirakl_custom_')) {
        return integration.id === data.marketplace.replace('mirakl_custom_', '')
      } else {
        return integration.type === data.marketplace
      }
    })
  }

  if (activeIntegrations.length === 0) {
    return { error: 'Für diese Auswahl sind keine aktiven Marktplätze verknüpft.' }
  }

  let totalChecked = 0
  let totalAffected = 0

  // ─── TEMPORARY RECOVERY FOR PENDING DECATHLON/MIRAKL ORDERS MISSING INVOICES ───
  try {
    const { orders } = await import('@/db/schema/orders')
    const { isNull, gte } = await import('drizzle-orm')
    const { createInvoiceForOrder } = await import('@/lib/invoice-service')
    const { downloadAndSaveMarketplaceInvoice, getAdapterForIntegration } = await import('@/workers/marketplace-sync')

    const today = new Date('2026-05-26T00:00:00.000Z')
    const candidateOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.companyId, auth.activeCompanyId),
          eq(orders.status, 'pending'),
          isNull(orders.invoiceId),
          gte(orders.createdAt, today)
        )
      )

    console.log(`[ManualSync-Recovery] Found ${candidateOrders.length} candidate pending orders created today.`)

    for (const order of candidateOrders) {
      const integration = activeIntegrations.find(i => 
        i.type === order.marketplace ||
        (i.type === 'mirakl_decathlon' && order.marketplace === 'Decathlon DE') ||
        (i.type === 'mirakl_custom' && 
         ((i.metadata as any)?.customName || '').toLowerCase() === order.marketplace.toLowerCase())
      )

      if (integration && (
        integration.type === 'mirakl_decathlon' ||
        integration.type === 'mirakl_decathlon_eu' ||
        integration.type === 'mirakl_custom'
      )) {
        console.log(`[ManualSync-Recovery] Processing order ${order.marketplaceOrderId}...`)
        const downloadInvoice = !!(integration.metadata as any)?.downloadInvoice
          const autoInvoice = !!integration.autoInvoice
          const adapter = getAdapterForIntegration(integration)

          if (downloadInvoice && adapter) {
            console.log(`[ManualSync-Recovery] Downloading invoice for ${order.marketplaceOrderId}...`)
            await downloadAndSaveMarketplaceInvoice(order.id, order.companyId, adapter)
            totalAffected++
          } else if (autoInvoice) {
            console.log(`[ManualSync-Recovery] Generating invoice for ${order.marketplaceOrderId}...`)
            const invResult = await createInvoiceForOrder(order.id, order.companyId)
            if (invResult && 'pdfBuffer' in invResult) {
              if (integration.uploadInvoice && adapter?.uploadInvoice) {
                console.log(`[ManualSync-Recovery] Uploading invoice for ${order.marketplaceOrderId}...`)
                await adapter.uploadInvoice(
                  order.marketplaceOrderId,
                  invResult.pdfBuffer,
                  `${invResult.invoiceNumber}.pdf`
                )
              }
              totalAffected++
            }
          }
      }
    }
  } catch (err) {
    console.error(`[ManualSync-Recovery] Failed to run pending order invoice recovery:`, err)
  }

  for (const integration of activeIntegrations) {
    try {
      let rawOrders: NormalizedOrder[] = []
      let adapter: any = null
      
      if (integration.type === 'otto') {
        const ottoAdapter = new OttoAdapter({
          clientId: integration.clientId!,
          clientSecret: integration.clientSecret!,
          environment: (integration.environment as 'sandbox' | 'production') || 'production',
          installationId: (integration.metadata as any)?.installationId,
          appId: (integration.metadata as any)?.appId
        })
        adapter = ottoAdapter
        rawOrders = await adapter.fetchUnshippedOrders(auth.activeCompanyId, {
          fromDate: data.fromDate,
          toDate: data.toDate
        })
      } else if (integration.type.startsWith('mirakl_')) {
        const customName = integration.type === 'mirakl_custom'
          ? ((integration.metadata as any)?.customName || 'mirakl_custom')
          : integration.type
        const miraklAdapter = new MiraklAdapter({
          instance: customName.toLowerCase(),
          baseUrl: integration.environment!,
          clientId: integration.clientId!,
          clientSecret: integration.clientSecret!,
          apiKey: integration.apiKey || undefined,
          shopId: (integration.metadata as any)?.shopId || undefined
        })
        adapter = miraklAdapter
        rawOrders = await adapter.fetchUnshippedOrders(auth.activeCompanyId, {
          fromDate: data.fromDate,
          toDate: data.toDate
        })
      } else if (integration.type === 'amazon') {
        const amzAdapter = new AmazonAdapter({
          sellerId: integration.sellerId!,
          clientId: integration.clientId!,
          clientSecret: integration.clientSecret!,
          refreshToken: integration.refreshToken!
        })
        adapter = amzAdapter
        rawOrders = await adapter.fetchUnshippedOrders(auth.activeCompanyId)
      } else if (integration.type === 'shopify') {
        const { ShopifyAdapter } = await import('@/adapters/marketplace/shopify')
        const shopifyAdapter = new ShopifyAdapter()
        adapter = shopifyAdapter
        rawOrders = await adapter.fetchUnshippedOrders(auth.activeCompanyId, { 
          fromDate: data.fromDate, 
          toDate: data.toDate 
        })
      } else if (integration.type === 'aboutyou') {
        const aboutYouAdapter = new AboutYouAdapter({
          apiKey: integration.apiKey!,
          environment: (integration.environment as 'sandbox' | 'production') || 'production'
        })
        adapter = aboutYouAdapter
        rawOrders = await adapter.fetchUnshippedOrders(auth.activeCompanyId, {
          fromDate: data.fromDate,
          toDate: data.toDate
        })
      } else if (integration.type === 'kaufland') {
        const { KauflandAdapter } = await import('@/adapters/marketplace/kaufland')
        const kauflandAdapter = new KauflandAdapter({
          clientId: integration.clientId!,
          clientSecret: integration.clientSecret!,
          environment: (integration.environment as 'sandbox' | 'production') || 'production'
        })
        adapter = kauflandAdapter
        rawOrders = await adapter.fetchUnshippedOrders(auth.activeCompanyId, {
          fromDate: data.fromDate,
          toDate: data.toDate
        })
      } else if (integration.type === 'ebay') {
        const { EbayAdapter } = await import('@/adapters/marketplace/ebay')
        const ebayAdapter = new EbayAdapter({
          clientId: integration.clientId!,
          clientSecret: integration.clientSecret!,
          environment: (integration.environment as 'sandbox' | 'production') || 'production'
        })
        adapter = ebayAdapter
        rawOrders = await adapter.fetchUnshippedOrders(auth.activeCompanyId, {
          fromDate: data.fromDate,
          toDate: data.toDate
        })
      }

      if (rawOrders && rawOrders.length > 0) {
        console.log(`[Sync] Found ${rawOrders.length} orders for ${integration.type}`)
        const result = await persistOrders(auth.activeCompanyId, rawOrders, true, integration, adapter) // true = isManualSync
        console.log(`[Sync] Result for ${integration.type}: Checked ${result.checked}, Affected ${result.affected}`)
        totalChecked += result.checked
        totalAffected += result.affected
      } else {
        console.log(`[Sync] No orders found for ${integration.type}`)
      }

      // Also sync shipped orders invoices for this integration
      const { syncShippedOrdersInvoices } = await import('@/workers/marketplace-sync')
      await syncShippedOrdersInvoices(auth.activeCompanyId, integration.type, integration.id)

      // Also sync returns/refunds for Mirakl integrations
      if (integration.type.startsWith('mirakl_') || integration.type === 'mirakl_custom') {
        const { syncMiraklReturns } = await import('@/workers/marketplace-sync')
        await syncMiraklReturns(auth.activeCompanyId, integration, adapter)
      }
    } catch (error) {
      console.error(`Error manually syncing ${integration.type}:`, error)
      // Continue to next integration even if one fails
    }
  }

  revalidatePath('/orders')
  
  if (totalAffected === 0) {
    return { success: true, message: `Import abgeschlossen! Es wurden keine neuen Bestellungen gefunden.` }
  }

  return { success: true, message: `Import erfolgreich! ${totalAffected} neue Bestellung(en) wurden hinzugefügt.` }
}

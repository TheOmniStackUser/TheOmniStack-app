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
      },
      {
        jobId: `sync-${integration.type}-${auth.activeCompanyId}-${Date.now()}` // Prevent exact duplicates
      }
    )
  }

  revalidatePath('/dashboard')
  return { success: true, message: 'Synchronisation wurde im Hintergrund gestartet!' }
}

export async function triggerManualSyncAction(data: { marketplace: string, fromDate?: string, toDate?: string }) {
  const auth = await requireAuth()

  // Find integrations based on selection
  let query: any = and(
    eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
    eq(marketplaceIntegrations.isActive, true)
  )

  if (data.marketplace !== 'all') {
    query = and(query, eq(marketplaceIntegrations.type, data.marketplace as any))
  }

  const activeIntegrations = await db.select().from(marketplaceIntegrations).where(query)

  if (activeIntegrations.length === 0) {
    return { error: 'Für diese Auswahl sind keine aktiven Marktplätze verknüpft.' }
  }

  let totalChecked = 0
  let totalAffected = 0

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
        const miraklAdapter = new MiraklAdapter({
          instance: integration.type as any,
          baseUrl: integration.environment!,
          clientId: integration.clientId!,
          clientSecret: integration.clientSecret!,
          apiKey: integration.apiKey || undefined
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

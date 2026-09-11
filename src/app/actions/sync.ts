'use server'


import { requireAuth } from '@/lib/session'
import { marketplaceSyncQueue } from '@/workers/marketplace-sync'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and, sql, notInArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { OttoAdapter } from '@/adapters/marketplace/otto'
import { MiraklAdapter } from '@/adapters/marketplace/mirakl'
import { AmazonAdapter } from '@/adapters/marketplace/amazon'
import { AboutYouAdapter } from '@/adapters/marketplace/aboutyou'
import { persistOrders } from '@/workers/marketplace-sync'
import type { NormalizedOrder } from '@/adapters/marketplace/base'

export async function getActiveIntegrationsList() {
  const auth = await requireAuth()

  const activeIntegrations = await db
    .select({ id: marketplaceIntegrations.id, type: marketplaceIntegrations.type, metadata: marketplaceIntegrations.metadata })
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.isActive, true),
        notInArray(marketplaceIntegrations.type, ['dhl', 'hermes'])
      )
    )

  return activeIntegrations.map(integration => {
    let label = integration.type as string
    let value: string = integration.type

    if (integration.type === 'mirakl_custom') {
      label = (integration.metadata as any)?.customName || 'Custom Mirakl'
      value = `mirakl_custom_${integration.id}`
    } else if (integration.type === 'mirakl_decathlon' || integration.type === 'mirakl_decathlon_eu') {
      label = 'Decathlon'
    } else if (integration.type === 'otto') {
      label = 'Otto'
    } else if (integration.type === 'aboutyou') {
      label = 'About You'
    } else if (integration.type === 'kaufland') {
      label = 'Kaufland'
    } else if (integration.type === 'ebay') {
      label = 'eBay'
    } else if (integration.type === 'amazon') {
      label = 'Amazon'
    } else if (integration.type === 'shopify') {
      label = 'Shopify'
    } else if (integration.type === 'etsy') {
      label = 'Etsy'
    }

    return { label, value }
  })
}

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
        notInArray(marketplaceIntegrations.type, ['dhl', 'hermes'])
      )
    )

  if (activeIntegrations.length === 0) {
    return { error: 'Es sind keine aktiven Marktplätze verknüpft.' }
  }

  const syncGroupId = `manual-${Date.now()}`
  const { getRedisConnection } = await import('@/workers/marketplace-sync')
  const redis = getRedisConnection()
  const groupKey = `sync-group:${auth.activeCompanyId}:${syncGroupId}`
  await redis.set(`${groupKey}:total`, activeIntegrations.length, 'EX', 86400) // 24h expire

  // Enqueue a job for each active integration
  for (const integration of activeIntegrations) {
    await marketplaceSyncQueue.add(
      `sync-${integration.type}`, // Job Name
      {
        companyId: auth.activeCompanyId,
        marketplace: integration.type as any,
        triggeredByUserId: auth.userId,
        integrationId: integration.id,
        syncGroupId,
        marketplaceDisplayName: (integration.metadata as any)?.customName || integration.type,
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
  try {
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
          return ['otto', 'aboutyou', 'shopify', 'kaufland', 'ebay', 'amazon', 'etsy'].includes(integration.type)
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
          const isDirect = ['otto', 'aboutyou', 'shopify', 'kaufland', 'ebay', 'amazon', 'etsy'].includes(integration.type)
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

    for (const integration of activeIntegrations) {
      const { marketplaceSyncQueue } = await import('@/workers/marketplace-sync')
      const syncGroupId = `manual-${Date.now()}`
      await marketplaceSyncQueue.add(
        `sync-${integration.type}`,
        {
          companyId: auth.activeCompanyId,
          marketplace: integration.type as any,
          triggeredByUserId: auth.userId,
          integrationId: integration.id,
          syncGroupId,
          fromDate: data.fromDate,
          toDate: data.toDate,
          marketplaceDisplayName: (integration.metadata as any)?.customName || integration.type,
        },
        {
          jobId: `manual-sync-${integration.type}-${integration.id}-${auth.activeCompanyId}-${Date.now()}`
        }
      )
    }

    revalidatePath('/orders')
    return { success: true, background: true, message: 'Import wurde im Hintergrund gestartet! Neue Bestellungen erscheinen in wenigen Minuten in der Übersicht.' }
  } catch (error: any) {
    console.error('FATAL ERROR IN triggerManualSyncAction:', error)
    if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    return { error: `Systemfehler: ${error instanceof Error ? error.message : String(error)}` }
  }
}

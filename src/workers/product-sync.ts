import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { products, productMappings, unmappedMarketplaceProducts } from '@/db/schema/products'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { getAdapterForIntegration } from '@/workers/marketplace-sync'

/**
 * Syncs products from activated marketplaces to the central product catalog.
 * This function can be called by a cron job or manual trigger.
 */
async function updateSyncStatus(integrationId: string, status: { isRunning: boolean, status: string, message: string, progress: number, total: number }) {
  try {
    const [integration] = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.id, integrationId)).limit(1)
    if (integration) {
      const metadata = (integration.metadata as any) || {}
      metadata.syncStatus = { ...status, lastUpdated: Date.now() }
      await db.update(marketplaceIntegrations).set({ metadata }).where(eq(marketplaceIntegrations.id, integrationId))
    }
  } catch (err) {
    console.error(`[ProductSync] Failed to update sync status for ${integrationId}`, err)
  }
}

export async function syncProductsForCompany(companyId: string, integrationId?: string) {
  let query: any = and(
    eq(marketplaceIntegrations.companyId, companyId),
    eq(marketplaceIntegrations.isActive, true)
  )

  if (integrationId) {
    query = and(query, eq(marketplaceIntegrations.id, integrationId))
  }

  const activeIntegrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(query)

  for (const integration of activeIntegrations) {
    try {
      const adapter = getAdapterForIntegration(integration)
      if (!adapter || !adapter.fetchProducts) {
        continue
      }

      console.log(`[ProductSync] Fetching products from ${integration.type} for company ${companyId}...`)
      
      await updateSyncStatus(integration.id, { isRunning: true, status: 'fetching', message: 'Lade Daten vom Marktplatz...', progress: 0, total: 0 })

      const onProgress = async (progress: number, total: number, message: string) => {
        await updateSyncStatus(integration.id, { isRunning: true, status: 'fetching', message, progress, total })
      }

      const marketplaceProducts = await adapter.fetchProducts!(companyId, onProgress)
      const totalCount = marketplaceProducts.length
      
      await updateSyncStatus(integration.id, { isRunning: true, status: 'processing', message: `Bereite ${totalCount} Produkte vor...`, progress: 0, total: totalCount })

      // Bulk Load existing data
      const existingMappings = await db.select().from(productMappings).where(and(eq(productMappings.companyId, companyId), eq(productMappings.marketplace, integration.type as any)))
      const existingProducts = await db.select().from(products).where(eq(products.companyId, companyId))

      const mappedSkus = new Set(existingMappings.map(m => m.marketplaceSku))
      const centralProductMap = new Map(existingProducts.map(p => [p.sku, p]))

      const toAutoMap: any[] = []
      const toUpsertUnmapped: any[] = []

      for (let i = 0; i < marketplaceProducts.length; i++) {
        const mpProduct = marketplaceProducts[i]

        if (!mappedSkus.has(mpProduct.sku)) {
          toUpsertUnmapped.push({
            companyId,
            marketplace: integration.type as any,
            marketplaceSku: String(mpProduct.sku),
            marketplaceProductId: String(mpProduct.marketplaceProductId),
            title: mpProduct.title,
            price: mpProduct.price?.toString() || '0',
            stock: mpProduct.stock !== undefined && mpProduct.stock !== null ? mpProduct.stock.toString() : null,
            rawPayload: mpProduct.rawPayload
          })
        }

        // Update progress in DB every 50 items to not overload DB
        if ((i + 1) % 50 === 0 || i === marketplaceProducts.length - 1) {
          await updateSyncStatus(integration.id, { 
            isRunning: true, 
            status: 'processing', 
            message: `Verarbeite ${i + 1} von ${totalCount} Produkten...`, 
            progress: i + 1, 
            total: totalCount 
          })
        }
      }

      await updateSyncStatus(integration.id, { isRunning: true, status: 'saving', message: `Speichere ${toUpsertUnmapped.length} ungemappte Produkte in die Datenbank...`, progress: totalCount, total: totalCount })

      // Batch Inserts for AutoMap
      if (toAutoMap.length > 0) {
        for (let i = 0; i < toAutoMap.length; i += 100) {
          const chunk = toAutoMap.slice(i, i + 100)
          await db.insert(productMappings).values(chunk).onConflictDoNothing()
        }
      }

      // Batch Inserts for Unmapped
      if (toUpsertUnmapped.length > 0) {
        for (let i = 0; i < toUpsertUnmapped.length; i += 100) {
          const chunk = toUpsertUnmapped.slice(i, i + 100)
          await db.insert(unmappedMarketplaceProducts).values(chunk).onConflictDoUpdate({
            target: [
              unmappedMarketplaceProducts.companyId,
              unmappedMarketplaceProducts.marketplace,
              unmappedMarketplaceProducts.marketplaceSku
            ],
            set: {
              title: sql`EXCLUDED.title`,
              price: sql`EXCLUDED.price`,
              stock: sql`EXCLUDED.stock`,
              marketplaceProductId: sql`EXCLUDED.marketplace_product_id`,
              rawPayload: sql`EXCLUDED.raw_payload`,
              updatedAt: new Date()
            }
          })
        }
      }

      await updateSyncStatus(integration.id, { isRunning: false, status: 'done', message: `Import erfolgreich abgeschlossen.`, progress: totalCount, total: totalCount })
      console.log(`[ProductSync] Completed ${integration.type}: ${toAutoMap.length} auto-mapped, ${toUpsertUnmapped.length} unmapped.`)
      
    } catch (error: any) {
      console.error(`[ProductSync] Failed to sync products for marketplace ${integration.type}`, error)
      await updateSyncStatus(integration.id, { isRunning: false, status: 'error', message: `Fehler: ${error?.message || 'Ein unbekannter Fehler ist aufgetreten.'}`, progress: 0, total: 0 })
    }
  }
}

/**
 * Pushes inventory and price updates from OmniStack to the mapped marketplaces.
 */
export async function pushUpdatesToMarketplaces(companyId: string, updates: { sku: string, stock?: number, price?: number }[]) {
  console.log(`[ProductSync] Pushing updates for ${updates.length} products for company ${companyId}...`)
  
  if (updates.length === 0) return { totalUpdatesSent: 0, activeMarketplaces: [] }

  const skus = updates.map(u => u.sku)

  // Find all mappings for these SKUs
  // First find central products
  const centralProducts = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(
      and(
        eq(products.companyId, companyId),
        inArray(products.sku, skus)
      )
    )

  if (centralProducts.length === 0) return { totalUpdatesSent: 0, activeMarketplaces: [] }

  const productIds = centralProducts.map(p => p.id)
  
  // Find mappings
  const mappings = await db
    .select()
    .from(productMappings)
    .where(
      and(
        eq(productMappings.companyId, companyId),
        inArray(productMappings.productId, productIds)
      )
    )

  // Group mappings by marketplace
  const updatesByMarketplace: Record<string, { sku: string, marketplaceProductId?: string, stock?: number, price?: number }[]> = {}

  for (const mapping of mappings) {
    const centralProduct = centralProducts.find(p => p.id === mapping.productId)
    if (!centralProduct) continue

    const updateDef = updates.find(u => u.sku === centralProduct.sku)
    if (!updateDef) continue

    if (!updatesByMarketplace[mapping.marketplace]) {
      updatesByMarketplace[mapping.marketplace] = []
    }

    const mUpdate: any = {
      sku: mapping.marketplaceSku,
      marketplaceProductId: mapping.marketplaceProductId || undefined
    }

    if (mapping.syncStock && updateDef.stock !== undefined) {
      mUpdate.stock = updateDef.stock
    }

    if (mapping.syncPrice && updateDef.price !== undefined) {
      let finalPrice = updateDef.price
      // Apply price modifiers
      if (mapping.priceModifierType === 'fixed') {
        finalPrice += parseFloat(mapping.priceModifierValue?.toString() || '0')
      } else if (mapping.priceModifierType === 'percentage') {
        const percent = parseFloat(mapping.priceModifierValue?.toString() || '0')
        finalPrice = finalPrice * (1 + (percent / 100))
      }
      mUpdate.price = finalPrice
    }

    if (mUpdate.stock !== undefined || mUpdate.price !== undefined) {
      updatesByMarketplace[mapping.marketplace].push(mUpdate)
    }
  }

  // Find active integrations
  const activeIntegrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, companyId),
        eq(marketplaceIntegrations.isActive, true)
      )
    )

  let totalUpdatesSent = 0
  const activeMarketplaces: string[] = []
  const failedMarketplaces: { name: string, error: string }[] = []

  for (const [marketplace, mpUpdates] of Object.entries(updatesByMarketplace)) {
    const integration = activeIntegrations.find(i => i.type === marketplace)
    if (!integration) continue

    const adapter = getAdapterForIntegration(integration)
    if (!adapter || !adapter.updateListings) continue

    const meta = integration.metadata as any
    const fallbackNames: Record<string, string> = {
      'otto': 'Otto',
      'mirakl_decathlon': 'Decathlon',
      'aboutyou': 'About You',
      'amazon': 'Amazon',
      'kaufland': 'Kaufland',
      'mirakl_custom': 'Limango'
    }
    const displayName = meta?.customName || fallbackNames[marketplace] || marketplace

    try {
      console.log(`[ProductSync] Pushing ${mpUpdates.length} updates to ${marketplace}...`)
      await adapter.updateListings(companyId, mpUpdates)
      totalUpdatesSent += mpUpdates.length
      if (!activeMarketplaces.includes(displayName)) {
        activeMarketplaces.push(displayName)
      }
    } catch (error: any) {
      console.error(`[ProductSync] Failed to push updates to ${marketplace}:`, error)
      failedMarketplaces.push({ name: displayName, error: error.message || 'Unbekannter Fehler' })
    }
  }

  return { totalUpdatesSent, activeMarketplaces, failedMarketplaces }
}

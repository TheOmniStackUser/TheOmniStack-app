import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { products, productMappings, unmappedMarketplaceProducts } from '@/db/schema/products'
import { eq, and, inArray } from 'drizzle-orm'
import { getAdapterForIntegration } from '@/workers/marketplace-sync'

/**
 * Syncs products from activated marketplaces to the central product catalog.
 * This function can be called by a cron job or manual trigger.
 */
export async function syncProductsForCompany(companyId: string, integrationId?: string) {
  // 1. Fetch active integrations that support product fetching
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
      const marketplaceProducts = await adapter.fetchProducts(companyId)
      
      let mappedCount = 0
      let unmappedCount = 0

      for (const mpProduct of marketplaceProducts) {
        // Check if a mapping already exists
        const [existingMapping] = await db
          .select()
          .from(productMappings)
          .where(
            and(
              eq(productMappings.companyId, companyId),
              eq(productMappings.marketplace, integration.type as any),
              eq(productMappings.marketplaceSku, mpProduct.sku)
            )
          )
          .limit(1)

        if (existingMapping) {
          mappedCount++
          // We can optionally sync stock/price back to central catalog if marketplace is source of truth,
          // but typically central catalog is source of truth. We just log for now.
        } else {
          // Check if there is a central product with this SKU to auto-map
          const [centralProduct] = await db
            .select()
            .from(products)
            .where(
              and(
                eq(products.companyId, companyId),
                eq(products.sku, mpProduct.sku)
              )
            )
            .limit(1)

          if (centralProduct) {
            // Auto-map
            await db.insert(productMappings).values({
              companyId,
              productId: centralProduct.id,
              marketplace: integration.type as any,
              marketplaceSku: mpProduct.sku,
              marketplaceProductId: mpProduct.marketplaceProductId,
              syncStock: true,
              syncPrice: false
            })
            mappedCount++
          } else {
            // Upsert into unmapped
            await db.insert(unmappedMarketplaceProducts).values({
              companyId,
              marketplace: integration.type as any,
              marketplaceSku: mpProduct.sku,
              marketplaceProductId: mpProduct.marketplaceProductId,
              title: mpProduct.title,
              price: mpProduct.price?.toString() || '0',
              stock: mpProduct.stock?.toString() || '0',
              rawPayload: mpProduct.rawPayload
            }).onConflictDoUpdate({
              target: [
                unmappedMarketplaceProducts.companyId,
                unmappedMarketplaceProducts.marketplace,
                unmappedMarketplaceProducts.marketplaceSku
              ],
              set: {
                title: mpProduct.title,
                price: mpProduct.price?.toString() || '0',
                stock: mpProduct.stock?.toString() || '0',
                marketplaceProductId: mpProduct.marketplaceProductId,
                rawPayload: mpProduct.rawPayload,
                updatedAt: new Date()
              }
            })
            unmappedCount++
          }
        }
      }
      
      console.log(`[ProductSync] Completed ${integration.type}: ${mappedCount} mapped/auto-mapped, ${unmappedCount} unmapped.`)
      
    } catch (error) {
      console.error(`[ProductSync] Failed to sync products for marketplace ${integration.type}`, error)
    }
  }
}

/**
 * Pushes inventory and price updates from OmniStack to the mapped marketplaces.
 */
export async function pushUpdatesToMarketplaces(companyId: string, updates: { sku: string, stock?: number, price?: number }[]) {
  console.log(`[ProductSync] Pushing updates for ${updates.length} products for company ${companyId}...`)
  
  if (updates.length === 0) return

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

  if (centralProducts.length === 0) return

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

  for (const [marketplace, mpUpdates] of Object.entries(updatesByMarketplace)) {
    const integration = activeIntegrations.find(i => i.type === marketplace)
    if (!integration) continue

    const adapter = getAdapterForIntegration(integration)
    if (!adapter || !adapter.updateListings) continue

    try {
      console.log(`[ProductSync] Pushing ${mpUpdates.length} updates to ${marketplace}...`)
      await adapter.updateListings(companyId, mpUpdates)
    } catch (error) {
      console.error(`[ProductSync] Failed to push updates to ${marketplace}:`, error)
    }
  }
}

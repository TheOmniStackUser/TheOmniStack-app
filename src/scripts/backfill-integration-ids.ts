import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { productMappings, unmappedMarketplaceProducts } from '@/db/schema/products'
import { eq, isNull } from 'drizzle-orm'

async function main() {
  console.log('Starting backfill for integrationId in product_mappings and unmapped_marketplace_products...')

  // Fetch all active integrations
  const allIntegrations = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.isActive, true))
  
  // Group integrations by company and type
  const integrationsByCompanyType = new Map<string, typeof allIntegrations>()
  for (const int of allIntegrations) {
    const key = `${int.companyId}:${int.type}`
    if (!integrationsByCompanyType.has(key)) {
      integrationsByCompanyType.set(key, [])
    }
    integrationsByCompanyType.get(key)!.push(int)
  }

  // 1. Backfill product_mappings
  console.log('Fetching product mappings without integrationId...')
  const mappingsToUpdate = await db
    .select()
    .from(productMappings)
    .where(isNull(productMappings.integrationId))
  
  console.log(`Found ${mappingsToUpdate.length} product mappings to backfill.`)
  let mappingsUpdated = 0

  for (const mapping of mappingsToUpdate) {
    const key = `${mapping.companyId}:${mapping.marketplace}`
    const matchingIntegrations = integrationsByCompanyType.get(key)
    
    if (matchingIntegrations && matchingIntegrations.length > 0) {
      // If there's only one, we use it. If there are multiple, we'll just pick the first one 
      // since we don't have enough data to distinguish them historically.
      const integrationId = matchingIntegrations[0].id
      
      await db.update(productMappings)
        .set({ integrationId })
        .where(eq(productMappings.id, mapping.id))
      
      mappingsUpdated++
    }
  }

  console.log(`Updated ${mappingsUpdated} product mappings.`)

  // 2. Backfill unmapped_marketplace_products
  console.log('Fetching unmapped marketplace products without integrationId...')
  const unmappedToUpdate = await db
    .select()
    .from(unmappedMarketplaceProducts)
    .where(isNull(unmappedMarketplaceProducts.integrationId))
  
  console.log(`Found ${unmappedToUpdate.length} unmapped products to backfill.`)
  let unmappedUpdated = 0

  for (const unmapped of unmappedToUpdate) {
    const key = `${unmapped.companyId}:${unmapped.marketplace}`
    const matchingIntegrations = integrationsByCompanyType.get(key)
    
    if (matchingIntegrations && matchingIntegrations.length > 0) {
      const integrationId = matchingIntegrations[0].id
      
      await db.update(unmappedMarketplaceProducts)
        .set({ integrationId })
        .where(eq(unmappedMarketplaceProducts.id, unmapped.id))
      
      unmappedUpdated++
    }
  }

  console.log(`Updated ${unmappedUpdated} unmapped marketplace products.`)

  console.log('Backfill complete.')
  process.exit(0)
}

main().catch((err) => {
  console.error('Error during backfill:', err)
  process.exit(1)
})

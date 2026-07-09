import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { productMappings, unmappedMarketplaceProducts } from '@/db/schema/products'
import { eq, isNull, and } from 'drizzle-orm'

async function main() {
  console.log('Starting fast backfill...')

  // Fetch all active integrations
  const allIntegrations = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.isActive, true))
  
  const integrationsByCompanyType = new Map<string, string>()
  for (const int of allIntegrations) {
    const key = `${int.companyId}:${int.type}`
    // First active integration "wins" for historical data
    if (!integrationsByCompanyType.has(key)) {
      integrationsByCompanyType.set(key, int.id)
    }
  }

  for (const [key, integrationId] of integrationsByCompanyType.entries()) {
    const [companyId, type] = key.split(':')
    
    try {
      // Update product mappings
      await db.update(productMappings)
        .set({ integrationId })
        .where(
          and(
            eq(productMappings.companyId, companyId),
            eq(productMappings.marketplace, type as any),
            isNull(productMappings.integrationId)
          )
        )

      // Update unmapped products
      await db.update(unmappedMarketplaceProducts)
        .set({ integrationId })
        .where(
          and(
            eq(unmappedMarketplaceProducts.companyId, companyId),
            eq(unmappedMarketplaceProducts.marketplace, type as any),
            isNull(unmappedMarketplaceProducts.integrationId)
          )
        )
    } catch (err: any) {
      // Skip errors for non-marketplace integrations like hermes or dhl
      if (err.message?.includes('invalid input value for enum marketplace')) {
        continue
      }
      console.error(`Error updating for ${type}:`, err)
    }
  }

  console.log('Bulk updates fired off. Verifying...')
  const remainingMappings = await db.select({ id: productMappings.id }).from(productMappings).where(isNull(productMappings.integrationId))
  const remainingUnmapped = await db.select({ id: unmappedMarketplaceProducts.id }).from(unmappedMarketplaceProducts).where(isNull(unmappedMarketplaceProducts.integrationId))

  console.log(`Remaining mappings with null integrationId: ${remainingMappings.length}`)
  console.log(`Remaining unmapped with null integrationId: ${remainingUnmapped.length}`)

  console.log('Fast backfill complete.')
  process.exit(0)
}

main().catch((err) => {
  console.error('Error during backfill:', err)
  process.exit(1)
})

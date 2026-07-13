import { db } from '@/db/client'
import { unmappedMarketplaceProducts } from '@/db/schema/products'
import { eq, isNull } from 'drizzle-orm'

async function main() {
  const all = await db.select().from(unmappedMarketplaceProducts).limit(10)
  console.log("Samples:", all.map(p => ({
    id: p.id,
    sku: p.marketplaceSku,
    marketplace: p.marketplace,
    integrationId: p.integrationId
  })))

  const nulls = await db.select({ count: unmappedMarketplaceProducts.id }).from(unmappedMarketplaceProducts).where(isNull(unmappedMarketplaceProducts.integrationId))
  console.log("Nulls count:", nulls.length)

  process.exit(0)
}

main().catch(console.error)

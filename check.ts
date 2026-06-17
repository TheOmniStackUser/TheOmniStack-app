import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { db } from './src/db/client'
import { productMappings, unmappedMarketplaceProducts } from './src/db/schema/products'
import { eq } from 'drizzle-orm'

async function run() {
  const mapped = await db.select().from(productMappings).where(eq(productMappings.marketplace, 'aboutyou' as any))
  const unmapped = await db.select().from(unmappedMarketplaceProducts).where(eq(unmappedMarketplaceProducts.marketplace, 'aboutyou' as any))
  console.log('AboutYou Mapped:', mapped.length, 'Unmapped:', unmapped.length)
  process.exit(0)
}
run().catch(console.error)

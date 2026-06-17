import { db } from './src/db/client'
import { products, productMappings } from './src/db/schema/products'
import { eq, isNull } from 'drizzle-orm'

async function main() {
  const mappings = await db.select().from(productMappings).where(isNull(productMappings.ean))
  console.log(`Found ${mappings.length} mappings without EAN`)
  let updated = 0
  for (const m of mappings) {
    const [prod] = await db.select().from(products).where(eq(products.id, m.productId))
    if (prod && prod.ean) {
      const firstEan = prod.ean.split(',')[0].trim()
      if (firstEan) {
        await db.update(productMappings).set({ ean: firstEan }).where(eq(productMappings.id, m.id))
        updated++
      }
    }
  }
  console.log(`Updated ${updated} mappings with EAN`)
  process.exit(0)
}

main().catch(console.error)

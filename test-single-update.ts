import { db } from './src/db/client'
import { products, productMappings } from './src/db/schema/products'
import { eq } from 'drizzle-orm'
import { pushUpdatesToMarketplaces } from './src/workers/product-sync'

async function run() {
  const companyId = '3c8718d2-8738-4239-9481-56b6b16b85fb'
  const sku = 'Badehose-LV-Style-YSB439-M'

  console.log(`Fetching central product for ${sku}...`)
  const [product] = await db.select().from(products).where(eq(products.sku, sku)).limit(1)

  if (!product) {
    console.log('Product not found!')
    process.exit(0)
  }

  console.log(`Current stock: ${product.currentStock}`)
  const mappings = await db.select().from(productMappings).where(eq(productMappings.productId, product.id))
  console.log(`Found ${mappings.length} mappings for this product:`)
  for (const m of mappings) {
    console.log(`- ${m.marketplace} (sku: ${m.marketplaceSku}, syncStock: ${m.syncStock})`)
  }

  const updates = [{
    sku: product.sku,
    stock: product.currentStock ? Number(product.currentStock) : 0
  }]

  console.log('Pushing single update...')
  const result = await pushUpdatesToMarketplaces(companyId, updates)
  console.log('Final Result:', result)
  process.exit(0)
}
run()

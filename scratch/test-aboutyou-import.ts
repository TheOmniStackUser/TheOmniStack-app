import { db } from '../src/db'
import { marketplaceIntegrations } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { AboutYouAdapter } from '../src/adapters/marketplace/aboutyou'

async function run() {
  const companyId = 'test-company'
  const integration = await db.query.marketplaceIntegrations.findFirst({
    where: eq(marketplaceIntegrations.type, 'aboutyou')
  })
  
  if (!integration || !integration.apiKey) {
    console.error('No AboutYou integration found with an API key.')
    process.exit(1)
  }

  console.log(`Testing with API key: ${integration.apiKey.substring(0,5)}...`)
  
  const adapter = new AboutYouAdapter({ apiKey: integration.apiKey })
  try {
    const products = await adapter.fetchProducts(companyId)
    console.log(`Success! Fetched ${products.length} products.`)
    if (products.length > 0) {
      console.log('Sample product:', JSON.stringify(products[0], null, 2))
    }
  } catch (error) {
    console.error('Failed to fetch products:', error)
  }
  process.exit(0)
}

run()

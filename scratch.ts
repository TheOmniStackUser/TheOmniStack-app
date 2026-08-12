import { config } from 'dotenv'
config({ path: '.env.local' })
import { db } from './src/db/client'
import { marketplaceIntegrations } from './src/db/schema/integrations'
import { eq, isNotNull } from 'drizzle-orm'
import { EbayAdapter } from './src/adapters/marketplace/ebay'

async function run() {
  try {
    const ebayInteg = await db.select().from(marketplaceIntegrations).where(
      isNotNull(marketplaceIntegrations.refreshToken)
    ).limit(1)
    
    if (ebayInteg.length === 0) {
      console.log('No ebay integration found')
      return
    }
    
    console.log('Found eBay integration for company', ebayInteg[0].companyId)
    const adapter = new EbayAdapter()
    
    console.log('Testing getOrders with fromDate 2026-08-11...')
    try {
        const orders = await adapter.fetchUnshippedOrders(ebayInteg[0].companyId, { fromDate: '2026-08-11' })
        console.log(`Found ${orders.length} orders`)
    } catch (e) {
        console.error(e)
    }

    console.log('Testing getOrders with fromDate undefined...')
    try {
        const orders = await adapter.fetchUnshippedOrders(ebayInteg[0].companyId)
        console.log(`Found ${orders.length} orders`)
    } catch (e) {
        console.error(e)
    }
  } catch (err) {
    console.error('Error:', err)
  }
}
run()

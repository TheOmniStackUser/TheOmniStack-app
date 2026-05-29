import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import { MiraklAdapter } from '../src/adapters/marketplace/mirakl'

async function run() {
  console.log('Fetching active integrations...')
  const integrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.isActive, true)
      )
    )
  
  console.log(`Found ${integrations.length} total active integrations.`)
  for (const integration of integrations) {
    console.log(`\n--------------------------------------------------`)
    console.log(`Integration Type: ${integration.type}`)
    console.log(`ID: ${integration.id}`)
    console.log(`Environment/BaseURL: ${integration.environment}`)
    
    if (integration.type.startsWith('mirakl') || integration.type === 'mirakl_custom') {
      const customName = integration.type === 'mirakl_custom'
        ? ((integration.metadata as any)?.customName || 'mirakl_custom')
        : integration.type
      
      console.log(`Initializing MiraklAdapter for instance "${customName}"...`)
      
      const adapter = new MiraklAdapter({
        instance: customName.toLowerCase(),
        baseUrl: integration.environment!,
        clientId: integration.clientId!,
        clientSecret: integration.clientSecret || '',
        apiKey: integration.apiKey || undefined
      })
      
      try {
        console.log(`Calling fetchUnshippedOrders...`)
        const orders = await adapter.fetchUnshippedOrders(integration.companyId)
        console.log(`Result: Returned ${orders.length} orders in SHIPPING state.`)
        for (const order of orders) {
          console.log(` - Order ID: ${order.marketplaceOrderId}, Buyer: ${order.buyer.name}, Amount: ${order.totalAmount}`)
        }
      } catch (err) {
        console.error(`Error during fetchUnshippedOrders for ${customName}:`, err)
      }
    }
  }
}

run().then(() => {
  console.log('\nTest completed successfully.')
  process.exit(0)
}).catch((err) => {
  console.error('Fatal error in test:', err)
  process.exit(1)
})

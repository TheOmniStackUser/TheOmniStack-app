import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import { MiraklAdapter } from '../src/adapters/marketplace/mirakl'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function run() {
  const integrations = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.isActive, true))
  const ssDe = integrations.find(i => {
    const customName = ((i.metadata as any)?.customName || '').toLowerCase()
    return customName.startsWith('secret sales de') || customName === 'secret sales de'
  })

  if (!ssDe) {
    console.log("No Secret Sales DE integration found.")
    return
  }

  console.log(`Found Integration: ${ssDe.type} / ${(ssDe.metadata as any)?.customName}`)
  
  const customName = ssDe.type === 'mirakl_custom'
    ? ((ssDe.metadata as any)?.customName || 'mirakl_custom')
    : ssDe.type

  const adapter = new MiraklAdapter({
    instance: customName.toLowerCase(),
    baseUrl: ssDe.environment!,
    clientId: ssDe.clientId!,
    clientSecret: ssDe.clientSecret!,
    apiKey: ssDe.apiKey || undefined,
    shopId: (ssDe.metadata as any)?.shopId || undefined
  })

  try {
    const orders = await adapter.fetchUnshippedOrders(ssDe.companyId)
    console.log(`Successfully fetched ${orders.length} orders.`)
    for (const o of orders) {
      console.log(`- Order: ${o.marketplaceOrderId} (Amount: ${o.totalAmount}, Country: ${o.shippingAddress.country})`)
    }
  } catch (err) {
    console.error("Error fetching orders:", err)
  }
  process.exit(0)
}

run()

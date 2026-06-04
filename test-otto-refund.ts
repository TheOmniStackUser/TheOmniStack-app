import { db } from './src/db/client'
import { orders } from './src/db/schema/orders'
import { marketplaceIntegrations } from './src/db/schema/integrations'
import { getAdapterForIntegration } from './src/workers/marketplace-sync'
import { eq } from 'drizzle-orm'

async function run() {
  const order = await db.query.orders.findFirst({
    where: eq(orders.marketplaceOrderId, 'cbn4xst6h3'),
    with: { items: true }
  })
  
  if (!order) {
    console.log('Order not found')
    process.exit(1)
  }
  
  console.log('Found order:', order.marketplaceOrderId)
  
  const integration = await db.query.marketplaceIntegrations.findFirst({
    where: eq(marketplaceIntegrations.companyId, order.companyId)
  })
  
  if (!integration) {
    console.log('Integration not found')
    process.exit(1)
  }
  
  const adapter = getAdapterForIntegration(integration)
  if (!adapter || !adapter.refundOrder) {
    console.log('Adapter not found or no refundOrder')
    process.exit(1)
  }
  
  const itemsToRefund = order.items.map(i => ({ sku: i.sku || '', quantity: 1 }))
  
  try {
    const res = await adapter.refundOrder(order.marketplaceOrderId, itemsToRefund, order.rawPayload)
    console.log('Refund result:', res)
  } catch (err) {
    console.error('Refund error:', err)
  }
  
  process.exit(0)
}

run()

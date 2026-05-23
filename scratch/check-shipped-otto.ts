import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { OttoAdapter } from '../src/adapters/marketplace/otto'
import { and, eq, isNull } from 'drizzle-orm'

async function run() {
  const companyId = '3c8718d2-8738-4239-9481-56b6b16b85fb'
  
  // Find all shipped Otto orders without invoice
  const shippedOttoOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.companyId, companyId),
        eq(orders.marketplace, 'otto'),
        eq(orders.status, 'shipped'),
        isNull(orders.invoiceId)
      )
    )

  console.log(`Found ${shippedOttoOrders.length} shipped Otto orders without invoice:`)
  for (const order of shippedOttoOrders) {
    console.log(`Order ID: ${order.id}, MarketplaceOrderId: ${order.marketplaceOrderId}, status: ${order.status}, tracking: ${order.trackingNumber}`)
  }

  if (shippedOttoOrders.length > 0) {
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(eq(marketplaceIntegrations.id, '6e9413ed-2bfc-4458-bdf8-9a41f85d466b'))
      .limit(1)

    const adapter = new OttoAdapter({
      clientId: integration.clientId!,
      clientSecret: integration.clientSecret!,
      environment: (integration.environment as 'sandbox' | 'production') || 'production',
      installationId: (integration.metadata as any)?.installationId,
      appId: (integration.metadata as any)?.appId
    })

    console.log('Trying to fetch receipts for the first shipped order...')
    const order = shippedOttoOrders[0]
    try {
      const result = await adapter.getInvoice(order.marketplaceOrderId)
      console.log(`Receipt fetch result for ${order.marketplaceOrderId}:`, result)
    } catch (err) {
      console.error(`Failed to fetch receipt for ${order.marketplaceOrderId}:`, err)
    }
  }

  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})

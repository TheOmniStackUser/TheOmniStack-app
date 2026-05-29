import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { eq, and, like } from 'drizzle-orm'

async function run() {
  const result = await db.select({
    id: orders.id,
    marketplace: orders.marketplace,
    marketplaceOrderId: orders.marketplaceOrderId,
    shippingCountry: orders.shippingCountry,
    buyerName: orders.buyerName,
    rawPayload: orders.rawPayload,
  }).from(orders).where(
    like(orders.marketplace, '%secret sales%')
  )
  console.dir(result.map(r => ({
    id: r.id,
    marketplace: r.marketplace,
    marketplaceOrderId: r.marketplaceOrderId,
    shippingCountry: r.shippingCountry,
    buyerName: r.buyerName,
    channelCode: (r.rawPayload as any)?.channel?.code
  })), { depth: null })
  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})

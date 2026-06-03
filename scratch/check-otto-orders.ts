import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { eq } from 'drizzle-orm'

async function run() {
  const ottoOrders = await db.query.orders.findMany({
    where: eq(orders.marketplace, 'otto'),
    limit: 10,
    orderBy: (orders, { desc }) => [desc(orders.createdAt)]
  })

  for (const o of ottoOrders) {
    const raw = o.rawPayload as any
    console.log(`DB ID: ${o.id}, DB marketplaceOrderId: ${o.marketplaceOrderId}`)
    console.log(`  raw.salesOrderId: ${raw?.salesOrderId}`)
    console.log(`  raw.orderNumber: ${raw?.orderNumber}`)
    console.log(`  raw.orderId: ${raw?.orderId}`)
  }
  process.exit(0)
}
run().catch(console.error)

import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { sql } from 'drizzle-orm'

async function run() {
  const count = await db.select({ count: sql<number>`count(*)` }).from(orders)
  console.log('Total orders:', count[0].count)

  const last5 = await db.select({
    id: orders.id,
    marketplaceOrderId: orders.marketplaceOrderId,
    marketplace: orders.marketplace,
    createdAt: orders.createdAt
  }).from(orders).orderBy(sql`created_at desc`).limit(5)
  console.log('Last 5 orders:', last5)

  // Case insensitive search
  const found = await db.select().from(orders).where(sql`lower(marketplace_order_id) like '%cbn%'`)
  console.log('Orders matching cbn:', found)

  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})

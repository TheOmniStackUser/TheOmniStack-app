import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { eq, and, gte, desc } from 'drizzle-orm'

async function main() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 2);
  yesterday.setHours(0,0,0,0);
  
  const recentOrders = await db.select().from(orders).where(
    and(
      eq(orders.companyId, '3c8718d2-8738-4239-9481-56b6b16b85fb'),
      eq(orders.marketplace, 'otto'),
      gte(orders.createdAt, yesterday)
    )
  ).orderBy(desc(orders.createdAt))

  console.log(`Found ${recentOrders.length} Otto orders imported since ${yesterday.toISOString()}`)
  for (const o of recentOrders.slice(0, 10)) {
    console.log(`Imported: ${o.marketplaceOrderId} at ${o.createdAt}`)
  }
  process.exit(0)
}
main().catch(console.error)

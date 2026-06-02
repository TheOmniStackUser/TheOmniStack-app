import { db } from './src/db/client'
import { orders } from './src/db/schema/orders'
import { eq } from 'drizzle-orm'

async function main() {
  const result = await db.select().from(orders).where(eq(orders.marketplaceOrderId, 'cbn4xxt9vh'))
  console.log(JSON.stringify(result, null, 2))
}

main().catch(console.error)

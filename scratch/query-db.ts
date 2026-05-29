import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { eq, and } from 'drizzle-orm'

async function run() {
  const companyId = '549c1c0b-0d32-42b7-912f-0c1198d676e'
  const orderId = 'B-10001'
  console.log(`--- DETAIL FOR ORDER B-10001 ---`)
  const result = await db.select().from(orders).where(
    and(
      eq(orders.companyId, companyId),
      eq(orders.marketplaceOrderId, orderId)
    )
  )
  console.dir(result, { depth: null })
  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})

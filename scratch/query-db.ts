import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { eq } from 'drizzle-orm'

async function run() {
  const orderId = 'ea262143-5a1d-42fe-8a27-c4b0cd7d65a6'
  console.log(`--- DETAIL FOR ORDER ${orderId} ---`)
  const result = await db.select().from(orders).where(eq(orders.id, orderId))
  console.dir(result, { depth: null })
  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})

import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { eq } from 'drizzle-orm'

async function check() {
  const result = await db
    .select()
    .from(orders)
    .where(eq(orders.marketplaceOrderId, 'd92f462c-586b-4155-af47-028f208c902b'))

  console.log("Order in DB:")
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

check().catch(console.error)

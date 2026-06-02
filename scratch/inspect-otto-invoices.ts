import { db } from '../src/db/client'
import { invoices } from '../src/db/schema/invoices'
import { orders } from '../src/db/schema/orders'
import { and, eq, isNull, sql } from 'drizzle-orm'

async function countUnpaid() {
  const result = await db
    .select({
      marketplace: orders.marketplace,
      unpaidCount: sql<number>`count(*)::int`
    })
    .from(invoices)
    .leftJoin(orders, eq(invoices.id, orders.invoiceId))
    .where(isNull(invoices.paidAt))
    .groupBy(orders.marketplace)

  console.log("Unpaid Invoices grouped by Marketplace:")
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

countUnpaid().catch(err => {
  console.error(err)
  process.exit(1)
})

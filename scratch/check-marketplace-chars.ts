import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { invoices } from '../src/db/schema/invoices'
import { and, eq, isNull } from 'drizzle-orm'

async function checkChars() {
  const unpaid = await db
    .select({
      invoiceId: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      orderId: orders.id,
      marketplace: orders.marketplace
    })
    .from(invoices)
    .leftJoin(orders, eq(invoices.id, orders.invoiceId))
    .where(and(
      eq(orders.marketplace, 'otto'),
      isNull(invoices.paidAt)
    ))
    .limit(5)

  for (const item of unpaid) {
    const mp = item.marketplace
    console.log(`Invoice ${item.invoiceNumber}: marketplace = "${mp}"`)
    if (mp) {
      const charCodes = Array.from(mp).map(char => char.charCodeAt(0))
      console.log(`  Char codes:`, charCodes)
    }
  }
  process.exit(0)
}

checkChars().catch(err => {
  console.error(err)
  process.exit(1)
})

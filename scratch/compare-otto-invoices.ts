import { db } from '../src/db/client'
import { invoices } from '../src/db/schema/invoices'
import { orders } from '../src/db/schema/orders'
import { eq } from 'drizzle-orm'

async function compare() {
  // 1. Paid invoice
  const [paidInv] = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      createdAt: invoices.createdAt,
      dueAt: invoices.dueAt,
      paidAt: invoices.paidAt,
    })
    .from(invoices)
    .where(eq(invoices.invoiceNumber, 'R-DE-305060414-2026-4294'))
    .limit(1)

  const [paidOrd] = await db
    .select({
      id: orders.id,
      status: orders.status,
      marketplace: orders.marketplace,
      marketplaceOrderId: orders.marketplaceOrderId,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.invoiceId, paidInv.id))
    .limit(1)

  // 2. Unpaid invoice
  const [unpaidInv] = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      createdAt: invoices.createdAt,
      dueAt: invoices.dueAt,
      paidAt: invoices.paidAt,
    })
    .from(invoices)
    .where(eq(invoices.invoiceNumber, 'R-DE-305060414-2026-4249'))
    .limit(1)

  const [unpaidOrd] = await db
    .select({
      id: orders.id,
      status: orders.status,
      marketplace: orders.marketplace,
      marketplaceOrderId: orders.marketplaceOrderId,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.invoiceId, unpaidInv.id))
    .limit(1)

  console.log("PAID INVOICE:")
  console.log(JSON.stringify(paidInv, null, 2))
  console.log("PAID ORDER:")
  console.log(JSON.stringify(paidOrd, null, 2))

  console.log("\nUNPAID INVOICE:")
  console.log(JSON.stringify(unpaidInv, null, 2))
  console.log("UNPAID ORDER:")
  console.log(JSON.stringify(unpaidOrd, null, 2))

  process.exit(0)
}

compare().catch(err => {
  console.error(err)
  process.exit(1)
})

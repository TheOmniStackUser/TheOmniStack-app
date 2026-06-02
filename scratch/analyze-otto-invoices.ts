import { db } from '../src/db/client'
import { invoices } from '../src/db/schema/invoices'
import { orders } from '../src/db/schema/orders'
import { and, eq, isNull, isNotNull } from 'drizzle-orm'

async function analyze() {
  const unpaid = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      createdAt: invoices.createdAt
    })
    .from(invoices)
    .leftJoin(orders, eq(invoices.id, orders.invoiceId))
    .where(and(
      eq(orders.marketplace, 'otto'),
      isNull(invoices.paidAt)
    ))
    .orderBy(invoices.createdAt)

  const paid = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      createdAt: invoices.createdAt
    })
    .from(invoices)
    .leftJoin(orders, eq(invoices.id, orders.invoiceId))
    .where(and(
      eq(orders.marketplace, 'otto'),
      isNotNull(invoices.paidAt)
    ))
    .orderBy(invoices.createdAt)

  console.log(`Otto Invoices Summary:`)
  console.log(`Total Paid Otto Invoices: ${paid.length}`)
  if (paid.length > 0) {
    console.log(`  Oldest Paid Otto Invoice: ${paid[0].invoiceNumber} (${paid[0].createdAt.toISOString()})`)
    console.log(`  Newest Paid Otto Invoice: ${paid[paid.length - 1].invoiceNumber} (${paid[paid.length - 1].createdAt.toISOString()})`)
  }

  console.log(`Total Unpaid Otto Invoices: ${unpaid.length}`)
  if (unpaid.length > 0) {
    console.log(`  Oldest Unpaid Otto Invoice: ${unpaid[0].invoiceNumber} (${unpaid[0].createdAt.toISOString()})`)
    console.log(`  Newest Unpaid Otto Invoice: ${unpaid[unpaid.length - 1].invoiceNumber} (${unpaid[unpaid.length - 1].createdAt.toISOString()})`)
  }

  process.exit(0)
}

analyze().catch(err => {
  console.error(err)
  process.exit(1)
})

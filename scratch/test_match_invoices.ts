import { db } from '../src/db/client'
import { invoices, orders } from '../src/db/schema'
import { like, eq } from 'drizzle-orm'

async function check() {
  const miraklInvoices = await db.query.invoices.findMany({
    where: like(invoices.recipientEmail, '%@mirakl.net'),
    with: { items: true }
  })
  
  let matchCount = 0
  for (const inv of miraklInvoices) {
    if (inv.items.some(i => i.sku === 'SHIPPING')) continue;

    // Find matching order
    const matchedOrders = await db.query.orders.findMany({
      where: eq(orders.buyerEmail, inv.recipientEmail || ''),
    })

    if (matchedOrders.length === 1) {
      matchCount++
    } else {
      console.log(`Invoice ${inv.invoiceNumber} matched ${matchedOrders.length} orders by email: ${inv.recipientEmail}`)
    }
  }
  
  console.log(`Matched ${matchCount} invoices to exactly 1 order.`)
  process.exit(0)
}
check().catch(console.error)

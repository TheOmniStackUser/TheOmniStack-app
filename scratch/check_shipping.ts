import { db } from '../src/db/client'
import { invoiceItems, invoices, orderItems, orders } from '../src/db/schema'
import { eq } from 'drizzle-orm'

async function run() {
  const items = await db.query.invoiceItems.findMany({
    where: eq(invoiceItems.sku, 'SHIPPING'),
    with: { invoice: true }
  })
  
  console.log(`Found ${items.length} SHIPPING invoiceItems`)
  for (const item of items.slice(0, 5)) {
    console.log(`Invoice: ${item.invoice.invoiceNumber}, UnitPrice: ${item.unitPrice}, LineTotal: ${item.lineTotal}, TaxRate: ${item.taxRate}`)
  }

  const oItems = await db.query.orderItems.findMany({
    where: eq(orderItems.sku, 'SHIPPING'),
    with: { order: true }
  })
  
  console.log(`Found ${oItems.length} SHIPPING orderItems`)
  for (const item of oItems.slice(0, 5)) {
    console.log(`Order: ${item.order.marketplaceOrderId}, UnitPrice: ${item.unitPrice}, TaxRate: ${item.taxRate}`)
  }

  process.exit(0)
}

run().catch(console.error)

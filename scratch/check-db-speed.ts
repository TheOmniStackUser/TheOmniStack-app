import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { invoices } from '../src/db/schema/invoices'
import { count } from 'drizzle-orm'

async function run() {
  console.log('--- DB Check ---')
  const orderCountRes = await db.select({ value: count() }).from(orders)
  const invoiceCountRes = await db.select({ value: count() }).from(invoices)
  console.log(`Total orders in DB: ${orderCountRes[0].value}`)
  console.log(`Total invoices in DB: ${invoiceCountRes[0].value}`)

  const start1 = Date.now()
  // Mock requireAuth result with a company id from existing orders
  const sampleOrder = await db.query.orders.findFirst()
  if (!sampleOrder) {
    console.log('No orders found to test.')
    return
  }
  const companyId = sampleOrder.companyId
  console.log(`Testing with companyId: ${companyId}`)

  // Measure orders query time
  const startOrders = Date.now()
  const allOrders = await db.query.orders.findMany({
    where: (orders, { eq, and, ne }) => and(
      eq(orders.companyId, companyId),
      eq(orders.isArchived, false),
      ne(orders.status, 'draft')
    ),
    orderBy: (orders, { desc }) => [desc(orders.marketplacePurchaseDate)],
    with: {
      items: true,
      invoice: {
        with: {
          logs: true
        }
      }
    }
  })
  console.log(`Orders query took: ${Date.now() - startOrders}ms, returned ${allOrders.length} records`)

  // Measure invoices query time
  const startInvoices = Date.now()
  const allInvoices = await db.query.invoices.findMany({
    where: (invoices, { eq, and }) => and(
      eq(invoices.companyId, companyId),
      eq(invoices.documentType, 'invoice')
    ),
    orderBy: (invoices, { desc }) => [desc(invoices.createdAt)]
  })
  console.log(`Invoices query took: ${Date.now() - startInvoices}ms, returned ${allInvoices.length} records`)
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

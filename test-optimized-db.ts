import { db } from './src/db/client'
import { orders, orderItems } from './src/db/schema/orders'
import { invoices, invoiceLogs } from './src/db/schema/invoices'
import { eq, desc, and, ne, inArray } from 'drizzle-orm'

async function test() {
  const start = Date.now()
  const activeCompanyId = "dummy-id" // we just want to see query speed, maybe we can fetch the first company
  const company = await db.query.companies.findFirst()
  if (!company) process.exit(0)

  const t1 = Date.now()
  const baseOrders = await db.select().from(orders).where(
    and(
      eq(orders.companyId, company.id),
      eq(orders.isArchived, false),
      ne(orders.status, 'draft')
    )
  ).orderBy(desc(orders.marketplacePurchaseDate))

  const orderIds = baseOrders.map(o => o.id)
  const invoiceIds = baseOrders.map(o => o.invoiceId).filter((id): id is string => id !== null)

  const [items, allInvoices, allLogs] = await Promise.all([
    orderIds.length > 0 
      ? db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
      : Promise.resolve([]),
    invoiceIds.length > 0 
      ? db.select().from(invoices).where(inArray(invoices.id, invoiceIds))
      : Promise.resolve([]),
    invoiceIds.length > 0 
      ? db.select().from(invoiceLogs).where(inArray(invoiceLogs.invoiceId, invoiceIds))
      : Promise.resolve([])
  ])

  const t2 = Date.now()
  console.log(`Fetched ${baseOrders.length} orders in ${t2 - t1}ms`)
  process.exit(0)
}
test()

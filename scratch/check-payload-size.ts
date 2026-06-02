import { db } from './src/db/client'
import { orders, orderItems } from './src/db/schema/orders'
import { invoices, invoiceLogs } from './src/db/schema/invoices'
import { eq, desc, and, ne, inArray } from 'drizzle-orm'

async function test() {
  const company = await db.query.companies.findFirst()
  if (!company) process.exit(0)

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

  const itemsByOrderId = items.reduce((acc, item) => {
    acc[item.orderId] = acc[item.orderId] || []
    acc[item.orderId].push(item)
    return acc
  }, {} as Record<string, any[]>)

  const logsByInvoiceId = allLogs.reduce((acc, log) => {
    acc[log.invoiceId] = acc[log.invoiceId] || []
    acc[log.invoiceId].push(log)
    return acc
  }, {} as Record<string, any[]>)

  const invoiceById = allInvoices.reduce((acc, inv) => {
    acc[inv.id] = inv
    return acc
  }, {} as Record<string, any>)

  const allOrders = baseOrders.map(o => {
    const inv = o.invoiceId ? invoiceById[o.invoiceId] : null
    return {
      ...o,
      items: itemsByOrderId[o.id] || [],
      invoice: inv ? { ...inv, logs: logsByInvoiceId[inv.id] || [] } : null
    }
  })

  const optimizedOrders = allOrders.map(order => {
    const raw = order.rawPayload as any
    let strippedPayload = null
    if (raw) {
      strippedPayload = {
        orderNumber: raw.orderNumber,
        financial_status: raw.financial_status,
        manualBillingAddress: raw.manualBillingAddress,
        invoiceAddress: raw.invoiceAddress,
        customer: raw.customer ? { billing_address: raw.customer.billing_address } : undefined,
        billing_street: raw.billing_street,
        billing_zip_code: raw.billing_zip_code,
        billing_city: raw.billing_city,
        billing_country_code: raw.billing_country_code,
      }
    }
    return {
      ...order,
      rawPayload: strippedPayload
    }
  })
  
  const jsonString = JSON.stringify(optimizedOrders)
  console.log(`Optimized JSON length: ${jsonString.length} bytes (approx ${jsonString.length / 1024 / 1024} MB)`)
  process.exit(0)
}
test()

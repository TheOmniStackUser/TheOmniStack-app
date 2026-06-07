import { db } from '../src/db/client'
import { orders, invoices, invoiceItems } from '../src/db/schema'
import { eq, desc, inArray } from 'drizzle-orm'

async function check() {
  const recentOrders = await db.query.orders.findMany({
    where: eq(orders.marketplaceOrderId, 'DE5KL68VWW6D-A'),
    with: {
      items: true
    }
  })
  
  console.log("Order state:", JSON.stringify(recentOrders, null, 2))

  const companyId = recentOrders[0]?.companyId
  if (companyId) {
    const recentInvoices = await db.query.invoices.findMany({
      where: eq(invoices.companyId, companyId),
      orderBy: [desc(invoices.createdAt)],
      limit: 5,
      with: {
        items: true
      }
    })
    console.log("Recent Invoices:", JSON.stringify(recentInvoices, null, 2))
  }
  process.exit(0)
}
check().catch(console.error)

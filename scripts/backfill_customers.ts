import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { customers } from '../src/db/schema/customers'
import { eq, isNotNull } from 'drizzle-orm'

async function backfill() {
  console.log('Starting customer backfill from orders...')
  
  const allOrders = await db.query.orders.findMany({
    where: isNotNull(orders.customerNumber),
    orderBy: (orders: any, { asc }: any) => [asc(orders.createdAt)]
  })

  let count = 0
  for (const order of allOrders) {
    if (!order.customerNumber) continue

    await db.insert(customers)
      .values({
        companyId: order.companyId,
        customerNumber: order.customerNumber,
        name: order.buyerName || order.shippingName || 'Unbekannt',
        companyName: order.shippingCompany || null,
        email: order.buyerEmail || null,
        phone: order.buyerPhone || order.shippingPhone || null,
        street: order.shippingStreet || null,
        zip: order.shippingZip || null,
        city: order.shippingCity || null,
        country: order.shippingCountry || 'DE',
      })
      .onConflictDoUpdate({
        target: [customers.companyId, customers.customerNumber],
        set: {
          name: order.buyerName || order.shippingName || 'Unbekannt',
          companyName: order.shippingCompany || null,
          email: order.buyerEmail || null,
          phone: order.buyerPhone || order.shippingPhone || null,
          street: order.shippingStreet || null,
          zip: order.shippingZip || null,
          city: order.shippingCity || null,
          country: order.shippingCountry || 'DE',
          updatedAt: new Date()
        }
      })
    count++
  }
  
  console.log(`Backfilled ${count} customers from orders.`)
  process.exit(0)
}

backfill().catch(e => {
  console.error(e)
  process.exit(1)
})

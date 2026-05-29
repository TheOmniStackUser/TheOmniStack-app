import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { eq, and, isNull, gte } from 'drizzle-orm'

async function main() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  console.log('Querying orders from today without invoices...')
  const list = await db.query.orders.findMany({
    where: and(
      isNull(orders.invoiceId),
      gte(orders.createdAt, today)
    ),
    with: {
      items: true
    }
  })

  console.log(`Found ${list.length} orders:`)
  for (const o of list) {
    console.log(`- ID: ${o.id}, Order Number: ${o.marketplaceOrderId}, Marketplace: ${o.marketplace}, Status: ${o.status}, Buyer: ${o.buyerName}, CreatedAt: ${o.createdAt}`)
  }
}

main().catch(console.error)

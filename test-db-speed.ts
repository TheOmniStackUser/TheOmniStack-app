import { db } from './src/db/client'
import { orders } from './src/db/schema/orders'
import { eq, desc, and, ne } from 'drizzle-orm'

async function test() {
  const start = Date.now()
  const allOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.isArchived, false),
      ne(orders.status, 'draft')
    ),
    orderBy: [desc(orders.marketplacePurchaseDate)],
    with: {
      items: true,
      invoice: {
        with: {
          logs: true
        }
      }
    }
  })
  const end = Date.now()
  console.log(`Fetched ${allOrders.length} orders in ${end - start}ms`)
  process.exit(0)
}

test()

import { createInvoiceForOrder } from '../src/lib/invoice-service'
import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { eq } from 'drizzle-orm'

async function main() {
  try {
    const [order] = await db.select().from(orders).where(eq(orders.marketplaceOrderId, 'cz2882073661-A')).limit(1)
    if (!order) {
      console.log('Order cz2882073661-A not found')
      return
    }
    console.log('Order found:', order)
    const result = await createInvoiceForOrder(order.id, order.companyId)
    console.log('Invoice generation result:', result)
  } catch (err) {
    console.error('Invoice generation failed with error:', err)
  } finally {
    process.exit(0)
  }
}

main()

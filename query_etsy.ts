import { db } from './src/db/client'
import { orders } from './src/db/schema'
import { eq, desc } from 'drizzle-orm'

async function run() {
  const latestOrder = await db.query.orders.findFirst({
    where: eq(orders.marketplace, 'etsy'),
    orderBy: [desc(orders.createdAt)],
  })
  
  if (latestOrder) {
    console.log("Marketplace ID:", latestOrder.marketplaceOrderId)
    console.log("Shipping Street:", latestOrder.shippingStreet)
    console.log("Shipping Zip:", latestOrder.shippingZip)
    console.log("Shipping City:", latestOrder.shippingCity)
    const raw = latestOrder.rawPayload as any
    console.log("Raw first_line:", raw?.first_line)
    console.log("Raw second_line:", raw?.second_line)
  } else {
    console.log("No etsy orders found.")
  }
  process.exit(0)
}
run().catch(console.error)

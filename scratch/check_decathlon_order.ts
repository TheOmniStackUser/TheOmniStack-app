import { db } from '../src/db/client'
import { sql } from 'drizzle-orm'
import { orders } from '../src/db/schema'
import { eq } from 'drizzle-orm'

async function run() {
  const orderList = await db.select().from(orders).where(eq(orders.marketplaceOrderId, 'DE5KL68VWW6D-A'))
  
  if (orderList.length > 0) {
    const order = orderList[0];
    console.log(`Order ID: ${order.id}`);
    console.log(`Marketplace: ${order.marketplace}`);
    console.log(`Raw Payload:`, JSON.stringify(order.rawPayload, null, 2));
  } else {
    console.log("Order not found.");
  }
  
  process.exit(0)
}
run().catch(console.error);

import { db } from '../src/db/client';
import { orders } from '../src/db/schema/orders';
import { eq } from 'drizzle-orm';

async function run() {
  // 1. Select the count of orders with status 'invoiced'
  const invoicedOrders = await db
    .select({
      id: orders.id,
      marketplaceOrderId: orders.marketplaceOrderId,
      status: orders.status
    })
    .from(orders)
    .where(eq(orders.status, 'invoiced'));

  console.log(`Found ${invoicedOrders.length} orders with status 'invoiced'.`);

  if (invoicedOrders.length > 0) {
    console.log("Migrating orders to 'pending' status...");
    
    // 2. Perform the update
    const result = await db
      .update(orders)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(orders.status, 'invoiced'))
      .returning({ id: orders.id });

    console.log(`Successfully updated ${result.length} orders to 'pending'.`);
  } else {
    console.log("No orders with status 'invoiced' found. Nothing to do.");
  }
}

run()
  .catch(console.error)
  .then(() => process.exit(0));

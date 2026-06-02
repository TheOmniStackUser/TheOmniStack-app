import { db } from '../src/db/client';
import { orders } from '../src/db/schema/orders';
import { invoices } from '../src/db/schema/invoices';
import { eq, sql } from 'drizzle-orm';

async function run() {
  const marketplaces = await db
    .select({
      marketplace: orders.marketplace,
      count: sql<number>`count(*)::int`
    })
    .from(orders)
    .groupBy(orders.marketplace);
  
  console.log("MARKETPLACES IN ORDERS:");
  console.log(marketplaces);

  const invoiceStats = await db
    .select({
      marketplace: orders.marketplace,
      status: invoices.status,
      paidAtNull: sql<boolean>`${invoices.paidAt} IS NULL`,
      count: sql<number>`count(*)::int`
    })
    .from(invoices)
    .leftJoin(orders, eq(invoices.id, orders.invoiceId))
    .groupBy(orders.marketplace, invoices.status, sql`${invoices.paidAt} IS NULL`);

  console.log("\nINVOICE STATS:");
  console.log(invoiceStats);
}

run().catch(console.error).then(() => process.exit(0));

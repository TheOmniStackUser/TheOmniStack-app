import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from './src/db/client';
import { orders } from './src/db/schema/orders';
import { sql } from 'drizzle-orm';
async function main() {
  const result = await db.select({
    marketplace: orders.marketplace,
    country: orders.shippingCountry,
    count: sql`count(*)`
  })
  .from(orders)
  .groupBy(orders.marketplace, orders.shippingCountry);
  console.log(result);
  process.exit(0);
}
main();

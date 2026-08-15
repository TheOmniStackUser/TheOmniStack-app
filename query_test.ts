import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from './src/db/client';
import { orders } from './src/db/schema/orders';
import { sql, eq, and, ne } from 'drizzle-orm';

async function main() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const res = await db.select({
      marketplace: orders.marketplace,
      dayCount: sql<number>`count(case when coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) >= ${startOfDay.toISOString()} then 1 end)::int`,
      monthCount: sql<number>`count(case when coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) >= ${new Date(now.getFullYear(), now.getMonth(), 1).toISOString()} then 1 end)::int`,
    })
    .from(orders)
    .groupBy(orders.marketplace);
    
  console.log("DB Stats:", res);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

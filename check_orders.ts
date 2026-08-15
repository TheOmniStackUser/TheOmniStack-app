import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
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
      yearCount: sql<number>`count(case when coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) >= ${new Date(now.getFullYear(), 0, 1).toISOString()} then 1 end)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.isArchived, false),
        sql`coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) >= ${new Date(now.getFullYear(), 0, 1).toISOString()}`
      )
    )
    .groupBy(orders.marketplace)
    .orderBy(sql`count(*) desc`);
    
  console.log("DB Stats:", res);
  
  // also get the top 5 recent purchase dates to see format
  const recent = await db.select({
    marketplace: orders.marketplace,
    purchaseDate: orders.marketplacePurchaseDate,
    createdAt: orders.createdAt,
  }).from(orders).orderBy(sql`${orders.createdAt} DESC`).limit(5);
  console.log("Recent purchase dates:", recent);
  
  // also check if "coalesce" is working
  const recent2 = await db.select({
    marketplace: orders.marketplace,
    dateToUse: sql`coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt})`
  }).from(orders).orderBy(sql`${orders.createdAt} DESC`).limit(5);
  console.log("Recent coalesce dates:", recent2);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

import { db } from './src/db/client';
import { products } from './src/db/schema/products';
import { eq } from 'drizzle-orm';

async function main() {
  const mapped = await db.select().from(products).where(eq(products.price, '0.36'));
  let fixedCount = 0;
  for (const p of mapped) {
    await db.update(products).set({ price: '35.89', msrp: '59.9' }).where(eq(products.id, p.id));
    fixedCount++;
  }
  
  const mapped2 = await db.select().from(products).where(eq(products.price, '0.6'));
  for (const p of mapped2) {
    await db.update(products).set({ price: '59.9', msrp: '79.9' }).where(eq(products.id, p.id));
    fixedCount++;
  }
  
  console.log(`Fixed ${fixedCount} central products.`);
  process.exit(0);
}
main().catch(console.error);

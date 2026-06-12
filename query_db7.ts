import { db } from './src/db/client';
import { products } from './src/db/schema/products';

async function main() {
  const mapped = await db.select().from(products);
  let c = 0;
  for (const p of mapped) {
    if (parseFloat(p.price) < 1) {
      console.log(p.sku, p.price);
      c++;
    }
  }
  console.log("Total below 1:", c);
  process.exit(0);
}
main().catch(console.error);

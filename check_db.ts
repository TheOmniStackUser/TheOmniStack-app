import { db } from './src/db/client';
import { products } from './src/db/schema/products';
import { eq } from 'drizzle-orm';

async function main() {
  const mapped = await db.select().from(products).where(eq(products.sku, 'BaBadehose-GM-Style-ZM1604-Rot-XXL'));
  console.log("CENTRAL PRODUCTS:", mapped);
  process.exit(0);
}
main().catch(console.error);

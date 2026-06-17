import { db } from './src/db/client';
import { unmappedMarketplaceProducts } from './src/db/schema/products';
import { eq } from 'drizzle-orm';

async function run() {
  const products = await db.select().from(unmappedMarketplaceProducts).where(eq(unmappedMarketplaceProducts.marketplace, 'otto')).limit(1);
  if (products.length > 0) {
    console.log(JSON.stringify(products[0].rawPayload, null, 2));
  } else {
    console.log("No unmapped otto products found.");
  }
}
run();

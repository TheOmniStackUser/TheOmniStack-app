import { db } from './src/db/client';
import { unmappedMarketplaceProducts } from './src/db/schema/products';
import { eq } from 'drizzle-orm';

async function check() {
  const products = await db.select().from(unmappedMarketplaceProducts).where(eq(unmappedMarketplaceProducts.marketplaceSku, 'AZ-Baadehose-GM-WHB2347-Gestreift-L'));
  console.log(JSON.stringify(products, null, 2));
  process.exit(0);
}
check().catch(console.error);

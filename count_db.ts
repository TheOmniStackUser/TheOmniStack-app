import { db } from './src/db/client';
import { unmappedMarketplaceProducts } from './src/db/schema/products';
import { eq } from 'drizzle-orm';

async function main() {
  const unmapped = await db.select().from(unmappedMarketplaceProducts).where(eq(unmappedMarketplaceProducts.marketplace, 'aboutyou' as any));
  console.log("Unmapped Count:", unmapped.length);
  process.exit(0);
}
main().catch(console.error);

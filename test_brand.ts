import { db } from './src/db/client';
import { unmappedMarketplaceProducts } from './src/db/schema/products';
import { eq, isNotNull } from 'drizzle-orm';

async function main() {
  const unmapped = await db.select().from(unmappedMarketplaceProducts).where(isNotNull(unmappedMarketplaceProducts.rawPayload)).limit(5);
  for (const u of unmapped) {
    const raw = u.rawPayload as any;
    console.log(u.marketplace, "Raw keys:", Object.keys(raw));
    if (raw.brand) console.log("brand:", raw.brand);
    if (raw.vendor) console.log("vendor:", raw.vendor);
  }
  process.exit(0);
}
main().catch(console.error);

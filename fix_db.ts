import { db } from './src/db/client';
import { unmappedMarketplaceProducts, products } from './src/db/schema/products';
import { eq, like } from 'drizzle-orm';

async function main() {
  console.log("Fixing Unmapped Products...");
  const unmapped = await db.select().from(unmappedMarketplaceProducts).where(eq(unmappedMarketplaceProducts.marketplace, 'aboutyou' as any));
  
  let fixedUnmappedCount = 0;
  for (const p of unmapped) {
    if (p.price === '0.36' || p.price === '0.6' || p.price === '0.42') {
      const rp = p.rawPayload as any;
      if (rp.prices && rp.prices.length > 0) {
        const priceObj = rp.prices.find((pr: any) => pr.country_code === 'DE') || rp.prices[0];
        if (priceObj && priceObj.sale_price) {
          await db.update(unmappedMarketplaceProducts).set({ price: String(priceObj.sale_price) }).where(eq(unmappedMarketplaceProducts.id, p.id));
          fixedUnmappedCount++;
        }
      }
    }
  }
  console.log(`Fixed ${fixedUnmappedCount} unmapped products.`);

  console.log("Fixing Central Products...");
  const mapped = await db.select().from(products).where(like(products.sku, '%Badehose-GM-Style%'));
  let fixedMappedCount = 0;
  for (const p of mapped) {
    if (p.price === '0.36' || p.price === '0.6') {
      // Find the corresponding raw payload from aboutyou if we can, or just reset it.
      // We will look for unmapped, or just update it if we know the prices.
      // But we deleted unmapped when we mapped them.
      // Let's just fix the specific one BaBadehose-GM-Style-ZM1604-Rot-XXL
      if (p.sku === 'BaBadehose-GM-Style-ZM1604-Rot-XXL' || p.price === '0.36') {
         await db.update(products).set({ price: '35.89', msrp: '59.9' }).where(eq(products.id, p.id));
         fixedMappedCount++;
      }
    }
  }
  console.log(`Fixed ${fixedMappedCount} mapped products.`);

  process.exit(0);
}
main().catch(console.error);

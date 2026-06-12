import { db } from './src/db/client';
import { products, unmappedMarketplaceProducts } from './src/db/schema/products';
import { isNotNull, isNull, eq } from 'drizzle-orm';

const getBrandFromPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.brand) {
     if (typeof payload.brand === 'string') return payload.brand;
     if (payload.brand.name) return payload.brand.name;
  }
  if (payload.vendor) return payload.vendor;
  if (payload.product_brand) return payload.product_brand;
  if (Array.isArray(payload.attributes)) {
     const brandAttr = payload.attributes.find((a: any) => a.name === 'Brand' || a.name === 'brand' || a.code === 'brand');
     if (brandAttr && brandAttr.value) return String(brandAttr.value);
  }
  return null;
};

async function main() {
  const unmapped = await db.select().from(unmappedMarketplaceProducts).where(isNotNull(unmappedMarketplaceProducts.rawPayload));
  let countUnmapped = 0;
  for (const u of unmapped) {
    const brand = getBrandFromPayload(u.rawPayload);
    if (brand && u.brand !== brand) {
      await db.update(unmappedMarketplaceProducts).set({ brand }).where(eq(unmappedMarketplaceProducts.id, u.id));
      countUnmapped++;
    }
  }
  console.log("Updated", countUnmapped, "unmapped products with brand");

  const allProducts = await db.select().from(products);
  let countProducts = 0;
  for (const p of allProducts) {
     if (p.brand) continue;
     const matchingUnmapped = unmapped.find(u => u.marketplaceSku === p.sku);
     if (matchingUnmapped && matchingUnmapped.rawPayload) {
        const brand = getBrandFromPayload(matchingUnmapped.rawPayload);
        if (brand) {
           await db.update(products).set({ brand }).where(eq(products.id, p.id));
           countProducts++;
        }
     }
  }
  console.log("Updated", countProducts, "central products with brand");
  process.exit(0);
}
main().catch(console.error);

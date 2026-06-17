import { bulkCreateProductsFromUnmapped } from './src/app/actions/products';
import { db } from './src/db/client';
import { unmappedMarketplaceProducts } from './src/db/schema/products';

async function main() {
  const products = await db.select().from(unmappedMarketplaceProducts).limit(1);
  if (products.length === 0) {
    console.log("No unmapped products found.");
    return;
  }
  const p = products[0];
  console.log("Found product:", p.id, p.title);
  
  try {
    // We can't easily mock requireAuth() in a simple script, 
    // so this might fail with "Nicht authentifiziert".
    await bulkCreateProductsFromUnmapped([p.id]);
    console.log("Success");
  } catch(e) {
    console.log("Error:", e);
  }
}
main();

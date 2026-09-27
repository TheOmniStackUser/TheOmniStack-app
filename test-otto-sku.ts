import { db } from './src/db/client';
import { products } from './src/db/schema/products';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq, and } from 'drizzle-orm';
import { OttoAdapter } from './src/adapters/marketplace/otto';

async function run() {
  const [product] = await db.select().from(products).where(eq(products.sku, '4251439214490')).limit(1);
  if (!product) return console.log("No product found");
  
  const integrations = await db.select().from(marketplaceIntegrations).where(and(eq(marketplaceIntegrations.type, 'otto'), eq(marketplaceIntegrations.companyId, product.companyId)));
  const valid = integrations.find(i => i.clientId && i.isActive);
  if (!valid) return console.log("No integration for company", product.companyId);
  
  const adapter = new OttoAdapter(valid);
  const token = await adapter['getAccessToken']();
  
  const r = await fetch(`https://api.otto.market/v5/products?sku=4251439214490`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("v5 get product status:", r.status);
  
  if (r.status === 200) {
    const data = await r.json();
    console.log("Current price in Otto:", JSON.stringify(data.productVariations[0]?.pricing));
    
    // Test payload for price update
    const payload1 = [{
      sku: "4251439214490", 
      standardPrice: { amount: 69.95, currency: 'EUR' },
      sale: {
        salePrice: { amount: 32.90, currency: 'EUR' },
        startDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        endDate: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
      }
    }];
    
    const r2 = await fetch(`https://api.otto.market/v5/products/prices`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload1)
    });
    console.log("v5 post price status:", r2.status);
    console.log("v5 post price body:", await r2.text());
  }
}
run();

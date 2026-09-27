import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq } from 'drizzle-orm';
import { OttoAdapter } from './src/adapters/marketplace/otto';

async function run() {
  const integrations = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'otto'));
  console.log("Found integrations:", integrations.length);
  const valid = integrations.find(i => i.clientId && i.isActive);
  if (!valid) {
    console.log("No valid integration.");
    return;
  }
  
  const adapter = new OttoAdapter(valid);
  const token = await adapter['getAccessToken']();
  
  const payload1 = [{
    sku: "Badeh-LV-Palm-Style-22-BlauOrange-M",
    standardPrice: { amount: 69.90, currency: 'EUR' },
    sale: {
      salePrice: {
        amount: 32.90,
        currency: 'EUR',
      },
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
    }
  }];

  const payload2 = {
    variationPrices: payload1
  };
  
  console.log("Testing array payload...");
  const r1 = await fetch(`${adapter['baseUrl']}/v5/products/prices`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload1)
  });
  console.log("Array payload Status:", r1.status);
  console.log("Array payload Body:", await r1.text());

  console.log("Testing variationPrices payload...");
  const r2 = await fetch(`${adapter['baseUrl']}/v5/products/prices`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload2)
  });
  console.log("variationPrices Status:", r2.status);
  console.log("variationPrices Body:", await r2.text());
}
run();

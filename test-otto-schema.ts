import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq } from 'drizzle-orm';
import { OttoAdapter } from './src/adapters/marketplace/otto';

async function run() {
  const [integration] = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'otto')).limit(1);
  if (!integration) { console.log('No otto integration'); return; }
  
  const adapter = new OttoAdapter(integration);
  const token = await adapter['getAccessToken']();
  
  const payload1 = [{
    sku: "Badeh-LV-Palm-Style-22-BlauOrange-M",
    standardPrice: { amount: 69.90, currency: 'EUR' },
    promotionalPrice: {
      amount: 32.90,
      currency: 'EUR',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
    }
  }];

  console.log("Testing array payload with promotionalPrice...");
  const r1 = await fetch(`https://sandbox.api.otto.market/v5/products/prices`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload1)
  });
  console.log("Array payload Status:", r1.status);
  console.log("Array payload Body:", await r1.text());
}
run();

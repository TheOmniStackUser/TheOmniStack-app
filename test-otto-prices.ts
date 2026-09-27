import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { OttoAdapter } from './src/adapters/marketplace/otto';

async function main() {
  const m = await db.query.marketplaceIntegrations.findFirst({
    where: (integrations, { eq, and }) => and(eq(integrations.companyId, '3c8718d2-8738-4239-9481-56b6b16b85fb'), eq(integrations.type, 'otto'))
  });
  if (!m) return;
  
  const adapter = new OttoAdapter(m);
  const token = await adapter['getAccessToken']();
  
  const payload = [
    {
      sku: 'AM-AMWB2401-Braun-36',
      standardPrice: { amount: 249.90, currency: 'EUR' },
      sale: {
        salePrice: { amount: 169.90, currency: 'EUR' },
        startDate: '2026-09-23T00:00:00Z',
        endDate: '2030-01-01T00:00:00Z'
      }
    }
  ];
  
  const urlsToTest = [
    '/v3/products/prices',
    '/v4/products/prices',
    '/v5/products/prices',
    '/v3/product-variation-prices',
    '/v4/product-variation-prices',
    '/v5/product-variation-prices',
  ];

  for (const path of urlsToTest) {
    console.log(`Testing ${path}...`);
    const res = await fetch(`${adapter['baseUrl']}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${await res.text()}`);
  }
  
  process.exit(0);
}
main();

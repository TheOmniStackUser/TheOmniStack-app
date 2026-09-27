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
  
  const urls = [
    '/v3/products',
    '/v3/product-variations',
    '/v4/products',
    '/v4/product-variations'
  ];
  
  for (const url of urls) {
    console.log(`Testing GET ${url}...`);
    const res = await fetch(`${adapter['baseUrl']}${url}?limit=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`Status: ${res.status}`);
  }
  
  process.exit(0);
}
main();

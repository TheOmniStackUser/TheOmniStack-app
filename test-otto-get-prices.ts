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
  
  console.log(`Testing GET /v5/products/prices...`);
  const res = await fetch(`${adapter['baseUrl']}/v5/products/prices?limit=1`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  
  console.log(`Status: ${res.status}`);
  console.log(`Response: ${await res.text()}`);
  
  process.exit(0);
}
main();

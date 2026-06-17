import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq, and } from 'drizzle-orm';

async function main() {
  const integration = await db.query.marketplaceIntegrations.findFirst({
    where: and(
      eq(marketplaceIntegrations.type, 'mirakl_decathlon'),
      eq(marketplaceIntegrations.companyId, '3c8718d2-8738-4239-9481-56b6b16b85fb')
    )
  });

  const headers: any = { 'Accept': 'application/json', 'Content-Type': 'application/json' }
  headers['Authorization'] = integration?.clientId;
  headers['X-Mirakl-Api-Key'] = integration?.apiKey;
  
  const returnId = '61e26466-8f39-43c0-ab70-2943159cdad0';

  console.log(`Trying to receive ${returnId} with V1 endpoint...`);
  const receiveUrl = `${integration?.environment}/api/v1/returns/${returnId}/receive`;
  const receiveRes = await fetch(receiveUrl, { method: 'PUT', headers, body: JSON.stringify({}) });
  console.log("Status:", receiveRes.status);
  console.log("Response:", await receiveRes.text());

  process.exit(0);
}

main().catch(console.error);

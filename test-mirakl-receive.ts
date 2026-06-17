import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq } from 'drizzle-orm';

async function main() {
  const integration = await db.query.marketplaceIntegrations.findFirst({
    where: eq(marketplaceIntegrations.type, 'mirakl_decathlon')
  });

  const headers: any = { 'Accept': 'application/json', 'Content-Type': 'application/json' }
  headers['Authorization'] = integration?.clientId;
  headers['X-Mirakl-Api-Key'] = integration?.apiKey;
  
  // Find the return first
  let pageToken: string | null = null;
  let returnId: string | null = null;
  
  do {
    let url = `${integration?.environment}/api/returns?state=IN_PROGRESS,WAITING_RECEPTION,PENDING_RECEPTION,CREATED&limit=100`;
    if (pageToken) url += `&page_token=${encodeURIComponent(pageToken)}`;
    
    const res = await fetch(url, { method: 'GET', headers });
    const data = await res.json();
    const returns = data.data || data.returns || [];
    
    for (const r of returns) {
      if (r.order_id?.includes('DE5L55NA7B9V') || r.order_commercial_id?.includes('DE5L55NA7B9V')) {
        returnId = r.id;
        console.log("Found return:", JSON.stringify(r, null, 2));
        break;
      }
    }
    if (returnId || returns.length === 0) break;
    pageToken = data.next_page_token;
  } while (pageToken);

  if (!returnId) {
    console.log("Return not found!");
    process.exit(1);
  }

  console.log(`Trying to receive ${returnId} with empty body...`);
  const receiveUrl = `${integration?.environment}/api/returns/${returnId}/receive`;
  const receiveRes = await fetch(receiveUrl, { method: 'PUT', headers, body: JSON.stringify({}) });
  console.log("Status:", receiveRes.status);
  console.log("Response:", await receiveRes.text());

  process.exit(0);
}

main().catch(console.error);

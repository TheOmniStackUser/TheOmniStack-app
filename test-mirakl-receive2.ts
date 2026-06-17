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

  if (!integration) {
    console.log("Integration not found!");
    process.exit(1);
  }

  const headers: any = { 'Accept': 'application/json', 'Content-Type': 'application/json' }
  headers['Authorization'] = integration.clientId;
  headers['X-Mirakl-Api-Key'] = integration.apiKey;
  
  let pageToken: string | null = null;
  let returnId: string | null = null;
  let returnObj: any = null;
  
  do {
    let url = `${integration.environment}/api/returns?state=IN_PROGRESS,WAITING_RECEPTION,PENDING_RECEPTION,CREATED&limit=100`;
    if (pageToken) url += `&page_token=${encodeURIComponent(pageToken)}`;
    
    const res = await fetch(url, { method: 'GET', headers });
    const data = await res.json();
    const returns = data.data || data.returns || [];
    
    for (const r of returns) {
      if (r.order_id?.includes('DE5L55NA7B9V') || r.order_commercial_id?.includes('DE5L55NA7B9V')) {
        returnId = r.id;
        returnObj = r;
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

  console.log("Found return:", returnObj.id, "lines:", returnObj.return_lines?.length);

  console.log(`Trying to receive ${returnId} with empty body...`);
  const receiveUrl = `${integration.environment}/api/returns/${returnId}/receive`;
  const receiveRes = await fetch(receiveUrl, { method: 'PUT', headers, body: JSON.stringify({}) });
  console.log("Status:", receiveRes.status);
  console.log("Response:", await receiveRes.text());

  // Try with payload if it fails
  if (!receiveRes.ok) {
    const payload = {
      returns: [
        {
          id: returnId,
          return_lines: returnObj.return_lines.map((l: any) => ({
            order_line_id: l.order_line_id,
            quantity: l.quantity
          }))
        }
      ]
    };
    console.log("Trying with payload:", JSON.stringify(payload));
    const receiveRes2 = await fetch(receiveUrl, { method: 'PUT', headers, body: JSON.stringify(payload) });
    console.log("Status2:", receiveRes2.status);
    console.log("Response2:", await receiveRes2.text());
  }

  process.exit(0);
}

main().catch(console.error);

import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from './src/db/client';
import { returnsLog } from './src/db/schema/returns';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { getAdapterForIntegration } from './src/workers/marketplace-sync';
import type { MiraklAdapter } from './src/adapters/marketplace/mirakl';

async function testMiraklDocs() {
  const limangoReturn = await db.query.returnsLog.findFirst({
    where: (rl, { ilike, isNotNull }) => ilike(rl.marketplace, 'limango%')
  });

  if (!limangoReturn) return;

  const integration = await db.query.marketplaceIntegrations.findFirst({
    where: (int, { eq, and }) => and(eq(int.companyId, limangoReturn.companyId), eq(int.isActive, true), eq(int.type, 'mirakl_custom'))
  });
  
  if (!integration) return;

  const adapter = getAdapterForIntegration(integration);
  try {
    const token = await (adapter as any).getAccessToken();
    const headers: any = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    else headers['Authorization'] = (adapter as any).config.apiKey;

    const docUrl = `${(adapter as any).config.baseUrl}/api/orders/documents?order_ids=${limangoReturn.orderNumber}`;
    const res = await fetch(docUrl, { headers });
    const data = await res.json();
    console.log('Limango docs:', data);
  } catch(e) {
    console.error(e);
  }
}
testMiraklDocs();

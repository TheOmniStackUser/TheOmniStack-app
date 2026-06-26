import { db } from './src/db/client';
import { returnsLog } from './src/db/schema/returns';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq } from 'drizzle-orm';
import { getAdapterForIntegration } from './src/workers/marketplace-sync';
import type { MiraklAdapter } from './src/adapters/marketplace/mirakl';
import type { AboutYouAdapter } from './src/adapters/marketplace/aboutyou';

async function testApis() {
  // Test Limango
  const limangoReturn = await db.query.returnsLog.findFirst({
    where: (rl, { ilike }) => ilike(rl.marketplace, 'limango%')
  });

  if (limangoReturn) {
    console.log('Found Limango return for order:', limangoReturn.orderNumber);
    const integration = await db.query.marketplaceIntegrations.findFirst({
      where: (int, { eq, and }) => and(eq(int.companyId, limangoReturn.companyId), eq(int.isActive, true), eq(int.type, 'mirakl_custom'))
    });
    
    if (integration) {
      const adapter = getAdapterForIntegration(integration);
      try {
        const token = await (adapter as any).getAccessToken();
        const headers: any = { 'Accept': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        else headers['Authorization'] = (adapter as any).config.apiKey;

        const docUrl = `${(adapter as any).config.baseUrl}/api/orders/documents?order_ids=${limangoReturn.orderNumber}`;
        console.log('Fetching Limango documents:', docUrl);
        const res = await fetch(docUrl, { headers });
        const text = await res.text();
        console.log('Limango documents response:', text);
      } catch (e) {
        console.error('Limango error:', e);
      }
    }
  }

  // Test AboutYou
  const ayReturn = await db.query.returnsLog.findFirst({
    where: (rl, { ilike }) => ilike(rl.marketplace, 'about%')
  });

  if (ayReturn) {
    console.log('Found AboutYou return for order:', ayReturn.orderNumber);
    const integration = await db.query.marketplaceIntegrations.findFirst({
      where: (int, { eq, and }) => and(eq(int.companyId, ayReturn.companyId), eq(int.isActive, true), eq(int.type, 'aboutyou'))
    });
    
    if (integration) {
      const adapter = getAdapterForIntegration(integration) as AboutYouAdapter;
      try {
        const endpoints = [
          'return_document', 'refund_document', 'credit_note_document', 'cancellation_document', 
          'return_receipt', 'refund_receipt', 'documents'
        ];
        for (const ep of endpoints) {
          const url1 = `${(adapter as any).baseUrl}/orders/${ayReturn.orderNumber}/${ep}`;
          console.log('Fetching AboutYou:', url1);
          const res1 = await fetch(url1, { headers: { 'X-API-Key': (adapter as any).config.apiKey } });
          console.log(`Status for ${ep}:`, res1.status);
          if (res1.ok) {
            console.log(`SUCCESS with ${ep}!`);
          }
        }
      } catch (e) {
        console.error('AboutYou error:', e);
      }
    }
  }
}

testApis();

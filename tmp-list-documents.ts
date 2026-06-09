import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema';
import { eq, and } from 'drizzle-orm';
import { MiraklAdapter } from './src/adapters/marketplace/mirakl';

async function main() {
  const integrationList = await db.select().from(marketplaceIntegrations).where(
    and(
      eq(marketplaceIntegrations.type, 'mirakl_custom')
    )
  );

  let limangoIntegration = null;
  for (const integ of integrationList) {
    const meta = integ.metadata as any;
    if (meta && (meta.customName?.toLowerCase() === 'limango' || meta.marketplaceName?.toLowerCase() === 'limango')) {
      limangoIntegration = integ;
      break;
    }
  }

  if (!limangoIntegration) {
    console.log("Limango integration not found");
    process.exit(1);
  }

  const meta = limangoIntegration.metadata as any || {};

  const config = {
    instance: 'limango',
    apiKey: limangoIntegration.apiKey || '',
    clientId: limangoIntegration.clientId || '',
    clientSecret: limangoIntegration.clientSecret || '',
    shopId: meta.shopId || '',
    baseUrl: limangoIntegration.environment || 'https://limango.mirakl.net'
  };

  const adapter = new MiraklAdapter(config);
  const token = await (adapter as any).getAccessToken();

  const headers: Record<string, string> = {
    'Accept': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['Authorization'] = config.clientId || config.apiKey || '';
    headers['X-Mirakl-Api-Key'] = config.clientId || config.apiKey || '';
  }

  const marketplaceOrderId = '20260618905-A';
  const docListUrl = `${config.baseUrl}/api/orders/documents?order_ids=${marketplaceOrderId}&shop_id=${config.shopId}`;

  const response = await fetch(docListUrl, { headers });
  const data = await response.json();
  
  console.log("Documents:", JSON.stringify(data, null, 2));

  process.exit(0);
}

main().catch(console.error);

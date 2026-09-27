import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq } from 'drizzle-orm';
import { OttoAdapter } from './src/adapters/marketplace/otto';

async function run() {
  const integrations = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'otto'));
  
  for (const valid of integrations) {
    if (!valid.clientId || !valid.isActive) continue;
    try {
      const adapter = new OttoAdapter(valid);
      const token = await adapter['getAccessToken']();
      
      const r = await fetch(`https://api.otto.market/v5/products?sku=4251439214490`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log("Integration", valid.id, "v5 status:", r.status);
      if (r.status !== 403 && r.status !== 401) {
        console.log("v5 body:", await r.text());
        break;
      }
    } catch(e) {}
  }
}
run();

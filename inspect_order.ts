import { db } from './src/db/client';
import { orders } from './src/db/schema/orders';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq, like } from 'drizzle-orm';

async function main() {
  const foundOrders = await db.select().from(orders).where(like(orders.marketplaceOrderId, '%DE5M1HBTYPEM%'));
  console.log("Found orders:");
  console.log(foundOrders);

  if (foundOrders.length > 0) {
    const marketplace = foundOrders[0].marketplace;
    const companyId = foundOrders[0].companyId;
    console.log(`Marketplace: ${marketplace}, CompanyId: ${companyId}`);
    
    if (marketplace) {
      const integrations = await db.select({
        id: marketplaceIntegrations.id,
        type: marketplaceIntegrations.type,
        metadata: marketplaceIntegrations.metadata
      }).from(marketplaceIntegrations).where(eq(marketplaceIntegrations.companyId, companyId || ''));
      console.log("Integrations:");
      console.log(JSON.stringify(integrations, null, 2));
    }
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { orders } from './src/db/schema/orders';

async function main() {
  const integrations = await db.select().from(marketplaceIntegrations);
  console.log('Integrations:');
  integrations.forEach(i => {
    console.log(`- type: ${i.type}, customName: ${(i.metadata as any)?.customName}`);
  });

  const distinctMarketplaces = await db.select({ marketplace: orders.marketplace }).from(orders).groupBy(orders.marketplace);
  console.log('\nDistinct order marketplaces:');
  distinctMarketplaces.forEach(m => {
    console.log(`- ${m.marketplace}`);
  });
  
  process.exit(0);
}
main().catch(console.error);

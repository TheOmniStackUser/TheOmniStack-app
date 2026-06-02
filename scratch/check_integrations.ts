import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { companies } from './src/db/schema/companies';

async function check() {
  const allIntegrations = await db.select().from(marketplaceIntegrations);
  console.log("Integrations:");
  allIntegrations.forEach(i => {
    if (i.type.includes('decathlon') || i.type === 'mirakl_custom') {
      console.log(`- ID: ${i.id}, Type: ${i.type}, Name: ${(i.metadata as any)?.customName}, isActive: ${i.isActive}`);
    }
  });

  const allCompanies = await db.select().from(companies);
  console.log("\nCompanies fetchOrdersMarketplaces:");
  allCompanies.forEach(c => {
    console.log(`- Company ID: ${c.id}, fetchOrdersMarketplaces: ${JSON.stringify(c.fetchOrdersMarketplaces)}`);
  });
  process.exit(0);
}
check().catch(console.error);

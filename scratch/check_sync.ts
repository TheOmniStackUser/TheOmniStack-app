import { db } from '../src/db/client';
import { companies } from '../src/db/schema';
import { marketplaceIntegrations } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';

async function main() {
  const allCompanies = await db.select({
    id: companies.id,
    name: companies.name,
    fetchOrdersDaily: companies.fetchOrdersDaily,
    fetchOrdersTime: companies.fetchOrdersTime,
    fetchOrdersMarketplaces: companies.fetchOrdersMarketplaces
  }).from(companies);
  
  console.log('Companies settings:');
  console.log(JSON.stringify(allCompanies, null, 2));

  for (const company of allCompanies) {
    if (!company.fetchOrdersDaily) continue;
    
    const allActiveIntegrations = await db
          .select({
            id: marketplaceIntegrations.id,
            type: marketplaceIntegrations.type,
            isActive: marketplaceIntegrations.isActive,
            metadata: marketplaceIntegrations.metadata
          })
          .from(marketplaceIntegrations)
          .where(
            and(
              eq(marketplaceIntegrations.companyId, company.id),
              eq(marketplaceIntegrations.isActive, true)
            )
          );
          
    console.log(`\nActive Integrations for ${company.name} (${company.id}):`);
    console.log(JSON.stringify(allActiveIntegrations, null, 2));
    
    if (company.fetchOrdersMarketplaces && company.fetchOrdersMarketplaces.length > 0) {
      const toSync = allActiveIntegrations.filter(integration =>
        company.fetchOrdersMarketplaces!.includes(integration.id)
      );
      console.log(`\nWill actually sync for ${company.name}:`, toSync.map(t => t.type));
    }
  }

  process.exit(0);
}

main().catch(console.error);

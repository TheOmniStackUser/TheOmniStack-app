import 'dotenv/config'; // Add this line
import { db } from '../src/db/client';
import { companies } from '../src/db/schema/companies';
import { marketplaceIntegrations } from '../src/db/schema/integrations';
import { eq, like } from 'drizzle-orm';

async function main() {
  const company = await db.query.companies.findFirst({
    where: like(companies.name, '%F&L Fashion%')
  });
  if (!company) {
    console.log('Company not found');
    return;
  }
  console.log('Company:', company.id, company.name, company.fetchOrdersTime, company.fetchOrdersMarketplaces);
  const integrations = await db.query.marketplaceIntegrations.findMany({
    where: eq(marketplaceIntegrations.companyId, company.id)
  });
  console.log('Integrations:', integrations.map(i => ({ id: i.id, type: i.type, metadata: i.metadata, isActive: i.isActive })));
  process.exit(0);
}
main().catch(console.error);

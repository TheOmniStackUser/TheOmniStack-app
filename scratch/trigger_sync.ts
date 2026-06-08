import { marketplaceSyncQueue } from '../src/workers/marketplace-sync';
import { db } from '../src/db/client';
import { companies } from '../src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const activeSyncCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
      fetchOrdersDaily: companies.fetchOrdersDaily,
      fetchOrdersTime: companies.fetchOrdersTime,
      fetchOrdersMarketplaces: companies.fetchOrdersMarketplaces,
    })
    .from(companies)
    .where(eq(companies.fetchOrdersDaily, true));

  for (const company of activeSyncCompanies) {
    if (!company.fetchOrdersMarketplaces || company.fetchOrdersMarketplaces.length === 0) {
      continue;
    }
    
    console.log(`Triggering manual 'daily' sync for ${company.name}...`);
    await marketplaceSyncQueue.add(
      'daily-marketplace-sync',
      { companyId: company.id },
      {
        jobId: `manual-trigger-daily-${company.id}-${Date.now()}`,
        removeOnComplete: true,
      }
    );
  }

  console.log('Successfully added jobs to queue.');
  process.exit(0);
}

main().catch(console.error);

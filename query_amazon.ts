import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq } from 'drizzle-orm';

async function run() {
  const amz = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'amazon'));
  console.log("Amazon integrations count:", amz.length);
  
  const companyCounts: Record<string, number> = {};
  amz.forEach(a => {
    companyCounts[a.companyId] = (companyCounts[a.companyId] || 0) + 1;
  });
  console.log("Counts per company:", companyCounts);
  process.exit(0);
}
run();

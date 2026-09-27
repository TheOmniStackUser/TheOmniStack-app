import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq } from 'drizzle-orm';

async function main() {
  const ints = await db.query.marketplaceIntegrations.findMany({
    where: (integrations, { eq }) => eq(integrations.companyId, '3c8718d2-8738-4239-9481-56b6b16b85fb')
  });
  console.log(ints.map(i => `${i.type} (${i.metadata?.customName || 'no name'}): active=${i.isActive}, id=${i.id}`));
  process.exit(0);
}
main();

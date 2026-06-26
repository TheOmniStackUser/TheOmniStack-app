import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';

async function main() {
  const integrations = await db.select({
    type: marketplaceIntegrations.type,
    metadata: marketplaceIntegrations.metadata
  }).from(marketplaceIntegrations);
  
  integrations.forEach(i => {
    console.log(`${i.type}: autoCreditNote=${(i.metadata as any)?.autoCreditNote}`);
  });

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

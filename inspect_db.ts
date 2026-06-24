import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq } from 'drizzle-orm';

async function main() {
  const result = await db.select({ metadata: marketplaceIntegrations.metadata }).from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'dhl'));
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

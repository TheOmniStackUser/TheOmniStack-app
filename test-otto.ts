import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq } from 'drizzle-orm';

async function run() {
  const integrations = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'otto'));
  console.log("Found integrations:", integrations.map(i => i.id + " active:" + i.isActive));
}
run();

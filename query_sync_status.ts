import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq } from 'drizzle-orm';

async function run() {
  const integrations = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'otto'));
  integrations.forEach(i => {
    console.log(`Integration: ${i.id}, Status: ${JSON.stringify(i.metadata)}`);
  });
}
run();

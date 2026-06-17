import { db } from './src/db/client';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq } from 'drizzle-orm';

async function run() {
  const integrations = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'otto'));
  for (const i of integrations) {
    const meta: any = i.metadata || {};
    if (meta.syncStatus && meta.syncStatus.isRunning) {
      meta.syncStatus.isRunning = false;
      meta.syncStatus.status = 'error';
      meta.syncStatus.message = 'Sync wurde vom System zurückgesetzt.';
      await db.update(marketplaceIntegrations).set({ metadata: meta }).where(eq(marketplaceIntegrations.id, i.id));
      console.log(`Reset integration ${i.id}`);
    }
  }
}
run();

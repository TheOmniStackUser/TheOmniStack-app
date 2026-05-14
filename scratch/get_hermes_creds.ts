import { db } from '../src/lib/db';
import { marketplaceIntegrations } from '../src/lib/schema';
import { eq } from 'drizzle-orm';

async function run() {
  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(eq(marketplaceIntegrations.type, 'hermes'))
    .limit(1);

  if (!integration) {
    console.error('Keine Hermes Integration gefunden.');
    process.exit(1);
  }

  console.log(JSON.stringify(integration, null, 2));
}

run().catch(console.error);

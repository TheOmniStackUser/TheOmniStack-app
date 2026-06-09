import { db } from '../src/db/client';
import { marketplaceIntegrations } from '../src/db/schema/integrations';
import { eq } from 'drizzle-orm';

async function main() {
  const integrationId = '8377ac3b-da23-47bb-bb4c-abba24145ffe';
  
  await db
    .update(marketplaceIntegrations)
    .set({
      accessToken: 'test_token_123',
      updatedAt: new Date()
    })
    .where(eq(marketplaceIntegrations.id, integrationId));
    
  console.log('Updated!');
  process.exit(0);
}

main().catch(console.error);

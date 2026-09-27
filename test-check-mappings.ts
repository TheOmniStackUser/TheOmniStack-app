import { db } from './src/db/client';
import { productMappings } from './src/db/schema/products';
import { marketplaceIntegrations } from './src/db/schema/integrations';
import { eq } from 'drizzle-orm';

async function main() {
  const companyId = '3c8718d2-8738-4239-9481-56b6b16b85fb';
  const ints = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.companyId, companyId));
  
  const decathlon = ints.find(i => i.type.includes('decathlon') || (i.metadata as any)?.customName?.includes('Decathlon'));
  console.log('Decathlon Integration:', decathlon ? { id: decathlon.id, type: decathlon.type, active: decathlon.isActive, customName: (decathlon.metadata as any)?.customName } : 'Not found');
  
  if (decathlon) {
    const mappings = await db.select().from(productMappings).where(eq(productMappings.integrationId, decathlon.id));
    console.log(`Found ${mappings.length} mappings for Decathlon.`);
    if (mappings.length > 0) {
      console.log('Sample mapping:', { sku: mappings[0].marketplaceSku, syncStock: mappings[0].syncStock, syncPrice: mappings[0].syncPrice });
    }
  }
  process.exit(0);
}
main();

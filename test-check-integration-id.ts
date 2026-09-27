import { db } from './src/db/client';
import { productMappings } from './src/db/schema/products';
import { eq, isNull } from 'drizzle-orm';

async function main() {
  const companyId = '3c8718d2-8738-4239-9481-56b6b16b85fb';
  const mappings = await db.select().from(productMappings).where(eq(productMappings.companyId, companyId));
  
  const nullInts = mappings.filter(m => !m.integrationId);
  console.log(`Total mappings: ${mappings.length}`);
  console.log(`Mappings with null integrationId: ${nullInts.length}`);
  
  process.exit(0);
}
main();

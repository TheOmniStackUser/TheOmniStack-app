import { db } from '@/db/client'
import { sql } from 'drizzle-orm'

async function main() {
  console.log('Running manual migration...')
  
  await db.execute(sql`ALTER TABLE "product_mappings" DROP CONSTRAINT IF EXISTS "unq_company_marketplace_listing"`)
  await db.execute(sql`ALTER TABLE "unmapped_marketplace_products" DROP CONSTRAINT IF EXISTS "unq_company_marketplace_unmapped_sku"`)
  
  try {
    await db.execute(sql`ALTER TABLE "product_mappings" ADD COLUMN "integration_id" uuid`)
    await db.execute(sql`ALTER TABLE "unmapped_marketplace_products" ADD COLUMN "integration_id" uuid`)
  } catch (e) {
    console.log('Columns may already exist', e)
  }

  await db.execute(sql`ALTER TABLE "product_mappings" ADD CONSTRAINT "product_mappings_integration_id_marketplace_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."marketplace_integrations"("id") ON DELETE cascade ON UPDATE no action`)
  await db.execute(sql`ALTER TABLE "unmapped_marketplace_products" ADD CONSTRAINT "unmapped_marketplace_products_integration_id_marketplace_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."marketplace_integrations"("id") ON DELETE cascade ON UPDATE no action`)
  
  await db.execute(sql`ALTER TABLE "product_mappings" ADD CONSTRAINT "unq_company_marketplace_listing" UNIQUE("company_id","integration_id","marketplace_sku")`)
  await db.execute(sql`ALTER TABLE "unmapped_marketplace_products" ADD CONSTRAINT "unq_company_marketplace_unmapped_sku" UNIQUE("company_id","integration_id","marketplace_sku")`)
  
  console.log('Manual migration complete')
  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

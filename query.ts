import postgres from 'postgres'

async function run() {
  const sql = postgres('postgresql://neondb_owner:!ha1860a81234CVs%24%25@ep-little-band-alr3isna-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require')
  const count = await sql`select count(*) from product_mappings where marketplace = 'aboutyou'`
  const unmapped = await sql`select count(*) from unmapped_marketplace_products where marketplace = 'aboutyou'`
  console.log('AboutYou Mapped:', count[0].count)
  console.log('AboutYou Unmapped:', unmapped[0].count)
  process.exit(0)
}
run().catch(console.error)

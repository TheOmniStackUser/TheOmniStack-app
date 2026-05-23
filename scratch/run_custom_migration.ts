import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is missing')
  process.exit(1)
}

async function run() {
  console.log('Connecting to database:', url.split('@')[1] || url)
  const sql = postgres(url, { ssl: 'require' })
  
  const queries = [
    `ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_invoice_number_unique";`,
    `ALTER TABLE "orders" ALTER COLUMN "marketplace" SET DATA TYPE text;`,
    `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "fetch_orders_daily" boolean DEFAULT false NOT NULL;`,
    `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "fetch_orders_time" text DEFAULT '03:00' NOT NULL;`,
    `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "fetch_orders_marketplaces" jsonb DEFAULT '[]'::jsonb NOT NULL;`,
    `ALTER TABLE "invoices" ADD CONSTRAINT "unq_company_invoice_number" UNIQUE("company_id","invoice_number");`
  ]

  for (const q of queries) {
    console.log('Executing:', q)
    try {
      await sql.unsafe(q)
      console.log('Success!')
    } catch (err: any) {
      console.error('Error executing query:', err.message)
      // We don't exit if it's already executed or similar, but let's see
    }
  }

  await sql.end()
  console.log('Done.')
}

run().catch(console.error)

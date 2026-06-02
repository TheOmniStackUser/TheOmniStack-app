import { db } from '../src/db/client'
import { sql } from 'drizzle-orm'

async function run() {
  console.log('--- Applying Performance Indexes to Neon DB ---')

  const queries = [
    {
      name: 'orders_company_active_idx',
      sql: sql`CREATE INDEX IF NOT EXISTS "orders_company_active_idx" ON "orders" USING btree ("company_id","is_archived","status","marketplace_purchase_date");`
    },
    {
      name: 'orders_company_created_at_idx',
      sql: sql`CREATE INDEX IF NOT EXISTS "orders_company_created_at_idx" ON "orders" USING btree ("company_id","created_at");`
    },
    {
      name: 'invoices_company_doc_created_idx',
      sql: sql`CREATE INDEX IF NOT EXISTS "invoices_company_doc_created_idx" ON "invoices" USING btree ("company_id","document_type","created_at");`
    },
    {
      name: 'returns_log_company_scanned_idx',
      sql: sql`CREATE INDEX IF NOT EXISTS "returns_log_company_scanned_idx" ON "returns_log" USING btree ("company_id","scanned_at");`
    }
  ]

  for (const query of queries) {
    console.log(`Running: ${query.name}...`)
    await db.execute(query.sql)
    console.log(`Successfully applied: ${query.name}`)
  }

  console.log('All indexes applied successfully!')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error applying indexes:', err)
    process.exit(1)
  })

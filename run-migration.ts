import { db } from './src/db/client'
import { sql } from 'drizzle-orm'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function run() {
  console.log("Adding indexes...")
  try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "invoice_items_invoice_id_idx" ON "invoice_items" USING btree ("invoice_id");`)
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "order_items_order_id_idx" ON "order_items" USING btree ("order_id");`)
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "invoice_logs_invoice_id_idx" ON "invoice_logs" USING btree ("invoice_id");`)
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "orders_invoice_id_idx" ON "orders" USING btree ("invoice_id");`)
    console.log("Indexes added successfully!")
  } catch (err) {
    console.error(err)
  }
  process.exit(0)
}

run()

import { db } from '../src/db/client'
import { sql } from 'drizzle-orm'

async function run() {
  console.log('Running raw SQL migration...')
  try {
    // 1. Create document_type type if not exists
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
          CREATE TYPE "document_type" AS ENUM('invoice', 'quote', 'delivery_note');
        END IF;
      END
      $$;
    `)
    console.log('document_type ENUM verified/created.')

    // 2. Add document_type column to invoices table if not exists
    await db.execute(sql`
      ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "document_type" "document_type" DEFAULT 'invoice' NOT NULL;
    `)
    console.log('document_type column added to invoices.')

    console.log('Migration completed successfully!')
  } catch (err) {
    console.error('Migration failed:', err)
  }
  process.exit(0)
}

run()

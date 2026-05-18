import { db } from '../src/db/client'
import { sql } from 'drizzle-orm'

async function migrate() {
  console.log('Running received_at migration query...')
  await db.execute(sql`
    ALTER TABLE "returns_log" ADD COLUMN IF NOT EXISTS "received_at" timestamp default now() NOT NULL;
  `)
  console.log('received_at column migrated successfully!')
}

migrate().catch(console.error)

import { db } from '../src/db/client'
import { sql } from 'drizzle-orm'

async function run() {
  console.log('Starting migration to add omnistack_beta to member_role enum...')
  try {
    // In Postgres, ALTER TYPE ADD VALUE cannot run inside a multi-statement transaction,
    // but running it directly on db works perfectly!
    await db.execute(sql`ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'omnistack_beta'`)
    console.log('Successfully added omnistack_beta to member_role enum!')
  } catch (err) {
    console.error('Error running migration:', err)
  }
}

run().catch(console.error)

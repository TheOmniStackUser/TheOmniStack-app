import { db } from '../src/db/client'
import { sql } from 'drizzle-orm'
async function check() {
  const result = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'company_members' AND column_name = 'api_key';
  `)
  console.log('Columns:', result.rows)
  process.exit(0)
}
check()

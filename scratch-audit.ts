import { db } from './src/db/client'
import { sql } from 'drizzle-orm'

async function checkAudit() {
  const result = await db.execute(sql`
    SELECT id, company_id, action, entity_type, entity_id, created_at, next_state
    FROM audit_logs
    WHERE action = 'sync_error'
    ORDER BY created_at DESC
    LIMIT 20;
  `)
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

checkAudit()

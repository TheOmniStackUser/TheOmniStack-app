import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db.execute(sql`
    SELECT id, company_id, user_id, action, entity_type, entity_id, next_state, created_at 
    FROM audit_logs 
    WHERE entity_type = 'marketplace_sync' 
    ORDER BY created_at DESC 
    LIMIT 20
  `);
  
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch(console.error);

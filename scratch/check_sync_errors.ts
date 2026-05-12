import { db } from '../src/db/client'
import { auditLogs } from '../src/db/schema/audit'
import { desc, eq } from 'drizzle-orm'

async function debug() {
  const errors = await db.select()
    .from(auditLogs)
    .where(eq(auditLogs.action, 'sync_error'))
    .orderBy(desc(auditLogs.createdAt))
    .limit(5)
    
  console.log('--- Die letzten 5 Sync-Fehler ---')
  errors.forEach(e => {
    console.log(`Zeit: ${e.createdAt}, Typ: ${e.entityId}, Fehler: ${JSON.stringify(e.nextState)}`)
  })
}

debug().catch(console.error)

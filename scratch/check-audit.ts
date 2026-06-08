import { db } from '../src/db/client'
import { auditLogs } from '../src/db/schema/audit'
import { eq, desc, and, gte } from 'drizzle-orm'

async function main() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 2);
  const logs = await db.select().from(auditLogs).where(
    and(
      eq(auditLogs.companyId, '3c8718d2-8738-4239-9481-56b6b16b85fb'),
      gte(auditLogs.createdAt, yesterday)
    )
  ).orderBy(desc(auditLogs.createdAt))
  console.log(`Found ${logs.length} audit logs since ${yesterday.toISOString()}`)
  for (const l of logs) {
    if (l.entityType === 'marketplace_sync') {
      console.log(`[${l.createdAt}] ${l.action} ${l.entityId} ${JSON.stringify(l.nextState)}`)
    }
  }
  process.exit(0)
}
main().catch(console.error)

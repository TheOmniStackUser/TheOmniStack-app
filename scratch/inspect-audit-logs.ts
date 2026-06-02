import { db } from '../src/db/client'
import { auditLogs } from '../src/db/schema/audit'
import { eq, or } from 'drizzle-orm'

async function inspectAudit() {
  const ids = [
    "c00af646-0a08-4043-88be-839f057c1bf4", // unpaid invoice
    "8d83cbf3-fcfa-464c-95c2-cf6454aa0839", // unpaid order
    "7697aad5-9925-44fd-aeb1-48bd5b5b810d", // paid invoice
    "fe55fa9d-7269-4871-af49-1005496d1c30"  // paid order
  ]

  const logs = await db
    .select()
    .from(auditLogs)
    .where(or(...ids.map(id => eq(auditLogs.entityId, id))))
    .orderBy(auditLogs.createdAt)

  console.log("Audit Logs for the compared items:")
  console.log(JSON.stringify(logs, null, 2))
  process.exit(0)
}

inspectAudit().catch(err => {
  console.error(err)
  process.exit(1)
})

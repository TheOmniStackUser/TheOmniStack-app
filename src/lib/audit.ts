import { db } from '@/db/client'
import { auditLogs } from '@/db/schema/audit'
import type { NewAuditLog } from '@/db/schema/audit'

type AuditOptions = Omit<NewAuditLog, 'id' | 'createdAt'>

/**
 * GoBD §146 AO compliant audit trail.
 * Call this on every write operation. Never throws — audit failures are logged
 * to stderr but never surface to the user (to prevent audit from blocking ops).
 */
export async function auditLog(options: AuditOptions): Promise<void> {
  try {
    await db.insert(auditLogs).values(options)
  } catch (err) {
    // Critical: audit log failure should alert ops, but not block the user
    console.error('[AUDIT] Failed to write audit log:', err, options)
  }
}

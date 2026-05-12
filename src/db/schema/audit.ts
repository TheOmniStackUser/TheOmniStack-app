import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
  jsonb,
} from 'drizzle-orm/pg-core'

// ─── Enums ────────────────────────────────────────────────────────────────────
export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
  'cancel',
  'issue',
  'login',
  'logout',
  'login_2fa',
  'sync_start',
  'sync_complete',
  'sync_error',
])

// ─── Audit Log ────────────────────────────────────────────────────────────────
// GoBD §146 AO: Complete, immutable record of all changes.
// This table MUST be insert-only. No UPDATE or DELETE ever.
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id'), // nullable for system-level events
  userId: uuid('user_id'),       // nullable for automated worker events
  action: auditActionEnum('action').notNull(),
  entityType: text('entity_type').notNull(), // 'invoice', 'order', 'company', etc.
  entityId: text('entity_id'),              // UUID of the affected record
  // Before/after snapshots for change tracking
  previousState: jsonb('previous_state'),
  nextState: jsonb('next_state'),
  // Request metadata for forensics
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Types ────────────────────────────────────────────────────────────────────
export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert

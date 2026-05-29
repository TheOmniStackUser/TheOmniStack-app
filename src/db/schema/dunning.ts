import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
  boolean,
  numeric,
  integer,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies'
import { invoices } from './invoices'
import { users } from './auth'

// ─── Enums ────────────────────────────────────────────────────────────────────
export const dunningStageEnum = pgEnum('dunning_stage', [
  'reminder',  // Zahlungserinnerung (freundlich, vor oder kurz nach Fälligkeit)
  'first',     // 1. Mahnung
  'second',    // 2. Mahnung
])

export const dunningStatusEnum = pgEnum('dunning_status', [
  'sent',
  'failed',
  'skipped',
])

// ─── Dunning Rules ────────────────────────────────────────────────────────────
// One row per stage per company. Each company can configure 3 stages.
export const dunningRules = pgTable('dunning_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  stage: dunningStageEnum('stage').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(false),
  // Days after due date (can be negative = days before due date)
  daysAfterDue: integer('days_after_due').notNull().default(0),
  subjectTemplate: text('subject_template').notNull().default(''),
  bodyTemplate: text('body_template').notNull().default(''),
  // Optional flat fee (e.g. 5.00 EUR). Informational only – mentioned in email body, not booked.
  feeAmount: numeric('fee_amount', { precision: 8, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Dunning Logs ─────────────────────────────────────────────────────────────
// Audit trail: which dunning email was sent for which invoice at which stage.
export const dunningLogs = pgTable('dunning_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  stage: dunningStageEnum('stage').notNull(),
  status: dunningStatusEnum('status').notNull().default('sent'),
  recipientEmail: text('recipient_email').notNull(),
  subject: text('subject').notNull().default(''),
  errorMessage: text('error_message'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  triggeredByUserId: uuid('triggered_by_user_id').references(() => users.id, { onDelete: 'set null' }),
})

// ─── Dunning Exclusions ────────────────────────────────────────────────────────
// Exclude specific recipient email addresses from the dunning process.
export const dunningExclusions = pgTable('dunning_exclusions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recipientEmail: text('recipient_email').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Company-level dunning toggle ─────────────────────────────────────────────
// The master switch is stored per rule. No separate companies column needed.

// ─── Relations ────────────────────────────────────────────────────────────────
export const dunningRulesRelations = relations(dunningRules, ({ one }) => ({
  company: one(companies, { fields: [dunningRules.companyId], references: [companies.id] }),
}))

export const dunningLogsRelations = relations(dunningLogs, ({ one }) => ({
  invoice: one(invoices, { fields: [dunningLogs.invoiceId], references: [invoices.id] }),
  triggeredBy: one(users, { fields: [dunningLogs.triggeredByUserId], references: [users.id] }),
}))

export const dunningExclusionsRelations = relations(dunningExclusions, ({ one }) => ({
  company: one(companies, { fields: [dunningExclusions.companyId], references: [companies.id] }),
}))

// ─── Types ────────────────────────────────────────────────────────────────────
export type DunningRule = typeof dunningRules.$inferSelect
export type NewDunningRule = typeof dunningRules.$inferInsert
export type DunningLog = typeof dunningLogs.$inferSelect
export type NewDunningLog = typeof dunningLogs.$inferInsert
export type DunningExclusion = typeof dunningExclusions.$inferSelect
export type NewDunningExclusion = typeof dunningExclusions.$inferInsert

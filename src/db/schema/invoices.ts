import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
  numeric,
  boolean,
  unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies'

// ─── Enums ────────────────────────────────────────────────────────────────────
export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'issued',
  'cancelled', // GoBD: invoices can only be cancelled, never deleted/edited
])

export const documentTypeEnum = pgEnum('document_type', [
  'invoice',
  'quote',
  'delivery_note'
])

// ─── Invoices ─────────────────────────────────────────────────────────────────
// GoBD-COMPLIANT: This table is append-only. No UPDATE of financial fields.
// Cancellations create a new credit-note row referencing the original.
export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'restrict' }), // never cascade-delete financial records
  documentType: documentTypeEnum('document_type').notNull().default('invoice'),
  // Human-readable invoice number (e.g. "INV-2024-0042")
  invoiceNumber: text('invoice_number').notNull(),
  draftName: text('draft_name'),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  // Recipient snapshot (immutable copy at time of issuance)
  recipientName: text('recipient_name').notNull(),
  recipientStreet: text('recipient_street'),
  recipientZip: text('recipient_zip'),
  recipientCity: text('recipient_city'),
  recipientCountry: text('recipient_country').notNull().default('DE'),
  recipientEmail: text('recipient_email'),
  // Financials
  currency: text('currency').notNull().default('EUR'),
  subtotalAmount: numeric('subtotal_amount', { precision: 12, scale: 2 }).notNull(),
  taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull(),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  taxRate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull().default('0.19'),
  // GoBD fields
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  // S3 / MinIO reference — immutable PDF stored with Object Lock
  pdfStorageKey: text('pdf_storage_key'),
  pdfGeneratedAt: timestamp('pdf_generated_at', { withTimezone: true }),
  // Cancellation chain
  isCreditNote: boolean('is_credit_note').notNull().default(false),
  cancelsInvoiceId: uuid('cancels_invoice_id'), // self-reference
  // Immutable audit fields — set once, never updated
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unqCompanyInvoice: unique('unq_company_invoice_number').on(t.companyId, t.invoiceNumber),
}))

// ─── Invoice Items ────────────────────────────────────────────────────────────
export const invoiceItems = pgTable('invoice_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull(), // denormalised for RLS
  position: numeric('position', { precision: 4, scale: 0 }).notNull(),
  sku: text('sku'),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  taxRate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull().default('0.19'),
  lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
})

// ─── Invoice Logs ─────────────────────────────────────────────────────────────
export const invoiceLogs = pgTable('invoice_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull(),
  action: text('action').notNull().default('edited'),
  note: text('note').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Relations ────────────────────────────────────────────────────────────────
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  company: one(companies, { fields: [invoices.companyId], references: [companies.id] }),
  items: many(invoiceItems),
  logs: many(invoiceLogs),
  creditNotes: many(invoices, { relationName: 'cancellation' }),
  originalInvoice: one(invoices, {
    fields: [invoices.cancelsInvoiceId],
    references: [invoices.id],
    relationName: 'cancellation',
  }),
}))

export const invoiceLogsRelations = relations(invoiceLogs, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLogs.invoiceId], references: [invoices.id] }),
}))

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
}))

// ─── Types ────────────────────────────────────────────────────────────────────
export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert
export type InvoiceItem = typeof invoiceItems.$inferSelect
export type NewInvoiceItem = typeof invoiceItems.$inferInsert
export type InvoiceLog = typeof invoiceLogs.$inferSelect
export type NewInvoiceLog = typeof invoiceLogs.$inferInsert

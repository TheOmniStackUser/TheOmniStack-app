import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
  numeric,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies'
import { users } from './auth'

export const incomingInvoiceStatusEnum = pgEnum('incoming_invoice_status', [
  'draft',
  'pending_payment',
  'paid',
  'cancelled'
])

export const incomingInvoices = pgTable('incoming_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'restrict' }),
  
  // The supplier/vendor information
  supplierName: text('supplier_name').notNull(),
  supplierVatId: text('supplier_vat_id'),
  supplierEmail: text('supplier_email'),
  supplierIban: text('supplier_iban'),
  supplierBic: text('supplier_bic'),

  // The invoice details
  invoiceNumber: text('invoice_number').notNull(),
  status: incomingInvoiceStatusEnum('status').notNull().default('draft'),
  
  // Financials
  currency: text('currency').notNull().default('EUR'),
  subtotalAmount: numeric('subtotal_amount', { precision: 12, scale: 2 }).notNull(),
  taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull(),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  
  // GoBD and Due dates
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  
  // S3 / MinIO reference for the uploaded original file
  fileStorageKey: text('file_storage_key'),
  fileType: text('file_type'), // e.g. 'application/pdf', 'application/xml'
  
  // Meta data
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  importedBy: uuid('imported_by').references(() => users.id, { onDelete: 'set null' }),
}, (t) => ({
  companySupplierIdx: index('incoming_inv_company_supplier_idx').on(t.companyId, t.supplierName),
}))

export const incomingInvoicesRelations = relations(incomingInvoices, ({ one }) => ({
  company: one(companies, { fields: [incomingInvoices.companyId], references: [companies.id] }),
  importedByUser: one(users, { fields: [incomingInvoices.importedBy], references: [users.id] }),
}))

export type IncomingInvoice = typeof incomingInvoices.$inferSelect
export type NewIncomingInvoice = typeof incomingInvoices.$inferInsert

import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './auth'
import { orders } from './orders'
import { invoices } from './invoices'

// ─── Enums ────────────────────────────────────────────────────────────────────
export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'member'])

// ─── Companies ────────────────────────────────────────────────────────────────
// Each row = one legal entity / tenant. All other tables reference company_id.
export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  legalName: text('legal_name').notNull(),
  taxId: text('tax_id'), // Steuernummer / USt-IdNr.
  vatId: text('vat_id'), // EU VAT number
  street: text('street'),
  zip: text('zip'),
  city: text('city'),
  country: text('country').notNull().default('DE'),
  email: text('email'),
  phone: text('phone'),
  // Warehouse address (optional, falls back to billing address)
  warehouseStreet: text('warehouse_street'),
  warehouseZip: text('warehouse_zip'),
  warehouseCity: text('warehouse_city'),
  warehouseCountry: text('warehouse_country').default('DE'),
  
  // Delivery Note / Company Details
  logoUrl: text('logo_url'),
  website: text('website'),
  paymentRecipient: text('payment_recipient'),
  bankName: text('bank_name'),
  iban: text('iban'),
  bic: text('bic'),
  management: text('management'),
  registrationCourt: text('registration_court'),
  deliveryNoteFooter: text('delivery_note_footer'),
  deliveryNoteFooterEn: text('delivery_note_footer_en'),
  returnsNote: text('returns_note'),
  returnsNoteEn: text('returns_note_en'),
  internationalLanguage: text('international_language').notNull().default('en'), // 'de' or 'en'

  // Invoice settings
  invoicePrefix: text('invoice_prefix').notNull().default('INV'),
  nextInvoiceNumber: text('next_invoice_number').notNull().default('1'),
  nextCustomerNumber: text('next_customer_number').notNull().default('1'),
  nextDeliveryNoteNumber: text('next_delivery_note_number').notNull().default('1'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Company Members ──────────────────────────────────────────────────────────
// Junction table — which users have access to which companies
export const companyMembers = pgTable('company_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: memberRoleEnum('role').notNull().default('member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Relations ────────────────────────────────────────────────────────────────
export const companiesRelations = relations(companies, ({ many }) => ({
  members: many(companyMembers),
  orders: many(orders),
  invoices: many(invoices),
}))

export const companyMembersRelations = relations(companyMembers, ({ one }) => ({
  company: one(companies, { fields: [companyMembers.companyId], references: [companies.id] }),
  user: one(users, { fields: [companyMembers.userId], references: [users.id] }),
}))

// ─── Types ────────────────────────────────────────────────────────────────────
export type Company = typeof companies.$inferSelect
export type NewCompany = typeof companies.$inferInsert
export type CompanyMember = typeof companyMembers.$inferSelect

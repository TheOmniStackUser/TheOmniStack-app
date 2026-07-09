import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
  boolean,
  jsonb,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './auth'
import { orders } from './orders'
import { invoices } from './invoices'

// ─── Enums ────────────────────────────────────────────────────────────────────
// Updated Roles:
// owner: Full control, billing, role management
// admin: Full merchant access, settings, integrations
// staff: Operational access only (orders, invoices), no settings
// omnistack_support: Internal support team, can see admin panel & beta features
// omnistack_beta: Internal support team, can see beta features but no admin panel
export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'staff', 'omnistack_support', 'omnistack_beta'])

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
  invoiceFooter: text('invoice_footer'),
  invoiceFooterEn: text('invoice_footer_en'),
  offerFooter: text('offer_footer'),
  offerFooterEn: text('offer_footer_en'),
  returnsNote: text('returns_note'),
  returnsNoteEn: text('returns_note_en'),
  internationalLanguage: text('international_language').notNull().default('en'), // 'de' or 'en'

  // Invoice settings
  invoicePrefix: text('invoice_prefix').notNull().default('INV'),
  nextInvoiceNumber: text('next_invoice_number').notNull().default('1'),
  nextCustomerNumber: text('next_customer_number').notNull().default('1'),
  nextDeliveryNoteNumber: text('next_delivery_note_number').notNull().default('1'),
  documentNumberSettings: jsonb('document_number_settings').$type<{
    invoice?: {
      auto: boolean;
      next: string;
      format: string;
      padding: number;
      perContact: boolean;
    };
    quote?: {
      auto: boolean;
      next: string;
      format: string;
      padding: number;
      perContact: boolean;
    };
    creditNote?: {
      auto: boolean;
      next: string;
      format: string;
      padding: number;
      perContact: boolean;
    };
    deliveryNote?: {
      auto: boolean;
      next: string;
      format: string;
      padding: number;
      perContact: boolean;
    };
    purchaseOrder?: {
      auto: boolean;
      next: string;
      format: string;
      padding: number;
      perContact: boolean;
    };
  }>(),
  apiKey: text('api_key').unique(), // For mobile app authentication
  trialExpiresAt: timestamp('trial_expires_at', { withTimezone: true }),
  newPendingEmail: text('new_pending_email'),
  emailVerificationToken: text('email_verification_token'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  smtpSettings: jsonb('smtp_settings').$type<{
    enabled: boolean;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    encryption?: 'ssl' | 'tls' | 'none';
    fromEmail?: string;
    fromName?: string;
  }>(),

  // Configurable daily automated order sync
  fetchOrdersDaily: boolean('fetch_orders_daily').notNull().default(false),
  fetchOrdersTime: text('fetch_orders_time').notNull().default('03:00'),
  fetchOrdersMarketplaces: jsonb('fetch_orders_marketplaces').$type<string[]>().notNull().default([]),
  syncNotificationEmail: text('sync_notification_email'),

  // Features
  featuresReturnsEnabled: boolean('features_returns_enabled').notNull().default(false),
  featuresProductsEnabled: boolean('features_products_enabled').notNull().default(false),

  // Cancellation
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  cancelEffectiveDate: timestamp('cancel_effective_date', { withTimezone: true }),
  cancelReason: jsonb('cancel_reason').$type<{
    category: string;
    subReason?: string;
    details?: string;
  }>(),
  registeredApp: text('registered_app').notNull().default('TheOmniStack'),

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
  role: memberRoleEnum('role').notNull().default('staff'), // Default to staff (safest)
  apiKey: text('api_key').unique(), // Personal API key for mobile app
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

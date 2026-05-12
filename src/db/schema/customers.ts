import {
  pgTable,
  text,
  uuid,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies'

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  
  customerNumber: text('customer_number'),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  
  // Address
  street: text('street'),
  zip: text('zip'),
  city: text('city'),
  country: text('country').notNull().default('DE'),
  
  // VAT
  vatId: text('vat_id'),
  lastVatCheckAt: timestamp('last_vat_check_at', { withTimezone: true }),
  vatCheckResult: text('vat_check_result'), // e.g. "VALID", "INVALID"

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unqCustomerEmail: unique('unq_company_customer_email').on(t.companyId, t.email),
  unqCustomerNumber: unique('unq_company_customer_number').on(t.companyId, t.customerNumber)
}))

export const customersRelations = relations(customers, ({ one }) => ({
  company: one(companies, { fields: [customers.companyId], references: [companies.id] }),
}))

export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert

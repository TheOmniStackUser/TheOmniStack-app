import {
  pgTable,
  text,
  uuid,
  timestamp,
  numeric,
  unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies'

export const vatSettings = pgTable('vat_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  countryCode: text('country_code').notNull(), // ISO 2-letter code
  vatType: text('vat_type').notNull().default('oss'), // 'oss', 'local', 'third_country', 'below_threshold'
  vatRate: numeric('vat_rate', { precision: 5, scale: 4 }).notNull(), // e.g., 0.1900
  localVatId: text('local_vat_id'), // Required if vatType is 'local'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unqVat: unique('unq_company_country_vat').on(t.companyId, t.countryCode)
}))

export const vatSettingsRelations = relations(vatSettings, ({ one }) => ({
  company: one(companies, { fields: [vatSettings.companyId], references: [companies.id] }),
}))

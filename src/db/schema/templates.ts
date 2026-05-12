import {
  pgTable,
  text,
  uuid,
  timestamp,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies'

export const invoiceTextTemplates = pgTable('invoice_text_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const invoiceTextTemplatesRelations = relations(invoiceTextTemplates, ({ one }) => ({
  company: one(companies, { fields: [invoiceTextTemplates.companyId], references: [companies.id] }),
}))

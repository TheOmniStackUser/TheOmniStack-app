import {
  pgTable,
  text,
  uuid,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'

export const systemSettings = pgTable('system_settings', {
  id: text('id').primaryKey(), // Using a fixed string ID like 'billing_config'
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

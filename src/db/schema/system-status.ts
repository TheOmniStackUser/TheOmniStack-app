import { pgTable, text, uuid, timestamp, pgEnum, boolean, integer, jsonb } from 'drizzle-orm/pg-core'

export const incidentStatusEnum = pgEnum('incident_status', [
  'investigating',
  'identified',
  'monitoring',
  'resolved',
  'maintenance',
])

export const systemServicesEnum = pgEnum('system_service', [
  'core_api',
  'amazon',
  'otto',
  'shopify',
  'aboutyou',
  'dhl',
  'hermes',
  'limango',
  'mirakl_decathlon',
  'mirakl_decathlon_eu',
  'mirakl_mediamarkt',
  'mirakl_custom',
  'kaufland',
  'ebay',
  'woocommerce',
  'shopware',
])

export const systemIncidents = pgTable('system_incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  service: systemServicesEnum('service').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: incidentStatusEnum('status').notNull().default('investigating'),
  startTime: timestamp('start_time', { withTimezone: true }).notNull().defaultNow(),
  endTime: timestamp('end_time', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// For historical uptime tracking (the green bars)
// We store one row per day per service to keep data minimal
// uptimeData is an array of 24 integers representing hours (1=up, 0=down, null=no data)
export const systemStatusDaily = pgTable('system_status_daily', {
  id: uuid('id').primaryKey().defaultRandom(),
  service: systemServicesEnum('service').notNull(),
  date: timestamp('date', { withTimezone: true }).notNull(), // Start of the day
  uptimeData: jsonb('uptime_data').notNull(), // e.g. [1, 1, 0, null, ...]
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

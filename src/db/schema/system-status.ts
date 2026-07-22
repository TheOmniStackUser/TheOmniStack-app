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
  'theomnistack_app',
  'profifaktura_app',
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

export const serviceNamesMap: Record<string, string> = {
  'core_api': 'TheOmniStack API (Kernsystem)',
  'theomnistack_app': 'TheOmniStack App',
  'profifaktura_app': 'ProfiFaktura App',
  'amazon': 'Amazon Marketplace',
  'otto': 'Otto Market',
  'shopify': 'Shopify',
  'aboutyou': 'About You',
  'dhl': 'DHL Geschäftskunden',
  'hermes': 'Hermes',
  'limango': 'Limango',
  'mirakl_decathlon': 'Decathlon (Mirakl)',
  'mirakl_decathlon_eu': 'Decathlon EU (Mirakl)',
  'mirakl_mediamarkt': 'MediaMarkt (Mirakl)',
  'mirakl_custom': 'Mirakl (Custom)',
  'kaufland': 'Kaufland',
  'ebay': 'eBay',
  'woocommerce': 'WooCommerce',
  'shopware': 'Shopware',
}

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

export const overrideStatusEnum = pgEnum('override_status', [
  'auto',
  'online',
  'offline'
])

// Manually override the live status of a service
export const systemStatusOverride = pgTable('system_status_override', {
  service: systemServicesEnum('service').primaryKey().notNull(),
  status: overrideStatusEnum('status').notNull().default('auto'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

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
  'etsy',
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
  'dpd',
])

export const serviceNamesMap: Record<string, string> = {
  'core_api': 'TheOmniStack API (Kernsystem)',
  'theomnistack_app': 'TheOmniStack App',
  'profifaktura_app': 'ProfiFaktura App',
  'amazon': 'Amazon Marketplace',
  'otto': 'Otto Market',
  'etsy': 'Etsy',
  'shopify': 'Shopify',
  'aboutyou': 'About You',
  'dhl': 'DHL Geschäftskunden',
  'hermes': 'Hermes',
  'dpd': 'DPD',
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

export type ServiceCategory = 'platform' | 'marketplace' | 'shipping' | 'shop'

export interface CategoryInfo {
  id: ServiceCategory
  title: string
  shortTitle: string
  description: string
  iconName: 'Server' | 'Store' | 'Truck' | 'ShoppingCart'
}

export const serviceCategoryOrder: ServiceCategory[] = ['marketplace', 'shipping', 'shop', 'platform']

export const serviceCategoryConfig: Record<ServiceCategory, CategoryInfo> = {
  marketplace: {
    id: 'marketplace',
    title: 'Marktplätze',
    shortTitle: 'Marktplätze',
    description: 'Schnittstellen zu europäischen und globalen Verkaufsplattformen',
    iconName: 'Store',
  },
  shipping: {
    id: 'shipping',
    title: 'Versanddienstleister',
    shortTitle: 'Versanddienstleister',
    description: 'Logistikpartner zur Label-Erstellung und Sendungsverfolgung',
    iconName: 'Truck',
  },
  shop: {
    id: 'shop',
    title: 'Shopsysteme',
    shortTitle: 'Shopsysteme',
    description: 'Anbindungen an Webshop- und E-Commerce-Plattformen',
    iconName: 'ShoppingCart',
  },
  platform: {
    id: 'platform',
    title: 'Plattform & Kernsysteme',
    shortTitle: 'Plattform',
    description: 'API- und Web-Infrastruktur von TheOmniStack',
    iconName: 'Server',
  },
}

export const serviceCategoryMap: Record<string, ServiceCategory> = {
  core_api: 'platform',
  theomnistack_app: 'platform',
  profifaktura_app: 'platform',
  amazon: 'marketplace',
  otto: 'marketplace',
  ebay: 'marketplace',
  kaufland: 'marketplace',
  etsy: 'marketplace',
  aboutyou: 'marketplace',
  limango: 'marketplace',
  mirakl_decathlon: 'marketplace',
  mirakl_decathlon_eu: 'marketplace',
  mirakl_mediamarkt: 'marketplace',
  mirakl_custom: 'marketplace',
  shopify: 'shop',
  shopware: 'shop',
  woocommerce: 'shop',
  dhl: 'shipping',
  hermes: 'shipping',
  dpd: 'shipping',
}

export const serviceBrandMap: Record<string, { badgeText: string; bgClass: string; textClass: string }> = {
  core_api: { badgeText: 'API', bgClass: 'bg-cyan-50 border-cyan-200', textClass: 'text-cyan-700' },
  theomnistack_app: { badgeText: 'APP', bgClass: 'bg-indigo-50 border-indigo-200', textClass: 'text-indigo-700' },
  profifaktura_app: { badgeText: 'APP', bgClass: 'bg-indigo-50 border-indigo-200', textClass: 'text-indigo-700' },
  amazon: { badgeText: 'AMZ', bgClass: 'bg-amber-500/10 border-amber-500/30', textClass: 'text-amber-800' },
  otto: { badgeText: 'OTTO', bgClass: 'bg-red-500/10 border-red-500/30', textClass: 'text-red-700' },
  ebay: { badgeText: 'eBay', bgClass: 'bg-blue-500/10 border-blue-500/30', textClass: 'text-blue-700' },
  kaufland: { badgeText: 'Kaufland', bgClass: 'bg-rose-500/10 border-rose-500/30', textClass: 'text-rose-700' },
  etsy: { badgeText: 'Etsy', bgClass: 'bg-orange-500/10 border-orange-500/30', textClass: 'text-orange-700' },
  aboutyou: { badgeText: 'AY', bgClass: 'bg-slate-900/10 border-slate-900/30', textClass: 'text-slate-900' },
  limango: { badgeText: 'Limango', bgClass: 'bg-emerald-500/10 border-emerald-500/30', textClass: 'text-emerald-700' },
  mirakl_decathlon: { badgeText: 'Decathlon', bgClass: 'bg-sky-500/10 border-sky-500/30', textClass: 'text-sky-700' },
  mirakl_decathlon_eu: { badgeText: 'Decathlon EU', bgClass: 'bg-sky-500/10 border-sky-500/30', textClass: 'text-sky-700' },
  mirakl_mediamarkt: { badgeText: 'MediaMarkt', bgClass: 'bg-red-500/10 border-red-500/30', textClass: 'text-red-700' },
  mirakl_custom: { badgeText: 'Mirakl', bgClass: 'bg-violet-500/10 border-violet-500/30', textClass: 'text-violet-700' },
  shopify: { badgeText: 'Shopify', bgClass: 'bg-emerald-500/10 border-emerald-500/30', textClass: 'text-emerald-700' },
  shopware: { badgeText: 'Shopware', bgClass: 'bg-blue-500/10 border-blue-500/30', textClass: 'text-blue-700' },
  woocommerce: { badgeText: 'Woo', bgClass: 'bg-purple-500/10 border-purple-500/30', textClass: 'text-purple-700' },
  dhl: { badgeText: 'DHL', bgClass: 'bg-amber-400/20 border-amber-400/40', textClass: 'text-amber-800' },
  hermes: { badgeText: 'Hermes', bgClass: 'bg-sky-500/10 border-sky-500/30', textClass: 'text-[#005A9C]' },
  dpd: { badgeText: 'DPD', bgClass: 'bg-rose-500/10 border-rose-500/30', textClass: 'text-rose-700' },
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

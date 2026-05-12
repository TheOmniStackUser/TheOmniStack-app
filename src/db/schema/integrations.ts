import { pgTable, text, uuid, timestamp, pgEnum, boolean, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies'

export const integrationTypeEnum = pgEnum('integration_type', [
  'amazon',
  'otto',
  'mirakl_decathlon',
  'mirakl_decathlon_eu',
  'mirakl_mediamarkt',
  'hermes',
  'dhl',
  'shopify',
  'aboutyou',
])

// Secure credential storage per company for marketplaces
export const marketplaceIntegrations = pgTable('marketplace_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  type: integrationTypeEnum('type').notNull(),
  
  // OAuth2 credentials
  clientId: text('client_id'),
  clientSecret: text('client_secret'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  
  // Amazon specific
  sellerId: text('seller_id'),
  
  // Mirakl specific
  apiKey: text('api_key'),
  
  environment: text('environment').default('production'), // 'sandbox' | 'production'

  // Rich config (used by DHL and future integrations)
  metadata: jsonb('metadata'),
  
  // Automation settings
  autoInvoice: boolean('auto_invoice').notNull().default(false),
  uploadInvoice: boolean('upload_invoice').notNull().default(false),

  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const marketplaceIntegrationsRelations = relations(marketplaceIntegrations, ({ one }) => ({
  company: one(companies, { fields: [marketplaceIntegrations.companyId], references: [companies.id] }),
}))

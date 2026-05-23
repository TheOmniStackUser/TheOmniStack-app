import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
  jsonb,
  numeric,
  unique,
  boolean,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies'
import { invoices } from './invoices'

// ─── Enums ────────────────────────────────────────────────────────────────────
export const orderStatusEnum = pgEnum('order_status', [
  'draft',      // manual entry draft
  'pending',    // fetched, not yet processed
  'processing', // invoice/label being generated
  'invoiced',   // invoice created
  'shipped',    // label created + shipped
  'cancelled',
  'later_shipment',
])

export const marketplaceEnum = pgEnum('marketplace', [
  'amazon',
  'otto',
  'mirakl_decathlon',
  'mirakl_decathlon_eu',
  'mirakl_mediamarkt',
  'manual',
  'shopify',
  'aboutyou',
  'kaufland',
  'ebay',
])

// ─── Orders ───────────────────────────────────────────────────────────────────
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  // Raw marketplace identifiers
  marketplace: text('marketplace').notNull(),
  marketplaceOrderId: text('marketplace_order_id').notNull(),
  marketplacePurchaseDate: timestamp('marketplace_purchase_date', { withTimezone: true }),
  // Buyer information
  buyerName: text('buyer_name'),
  buyerEmail: text('buyer_email'),
  shippingName: text('shipping_name'),
  shippingStreet: text('shipping_street'),
  shippingCity: text('shipping_city'),
  shippingZip: text('shipping_zip'),
  shippingCountry: text('shipping_country'),
  // Financials
  currency: text('currency').notNull().default('EUR'),
  subtotalAmount: numeric('subtotal_amount', { precision: 12, scale: 2 }),
  taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }),
  // Raw payload preserved for audit / reconciliation
  rawPayload: jsonb('raw_payload'),
  // Status
  status: orderStatusEnum('status').notNull().default('pending'),
  // Linked invoice (once created)
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }),
  isArchived: boolean('is_archived').notNull().default(false),
  customerNumber: text('customer_number'),
  deliveryNoteNumber: text('delivery_note_number'),
  trackingNumber: text('tracking_number'),
  labelUrl: text('label_url'),
  returnTrackingNumber: text('return_tracking_number'),
  returnLabelUrl: text('return_label_url'),
  totalWeight: numeric('total_weight', { precision: 8, scale: 3 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unqOrder: unique('unq_company_marketplace_order').on(t.companyId, t.marketplaceOrderId)
}))

// ─── Order Items ──────────────────────────────────────────────────────────────
export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull(), // denormalised for RLS
  sku: text('sku'),
  asin: text('asin'),
  title: text('title').notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 0 }).notNull().default('1'),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  taxRate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull().default('0.19'),
})

// ─── Relations ────────────────────────────────────────────────────────────────
export const ordersRelations = relations(orders, ({ one, many }) => ({
  company: one(companies, { fields: [orders.companyId], references: [companies.id] }),
  invoice: one(invoices, { fields: [orders.invoiceId], references: [invoices.id] }),
  items: many(orderItems),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}))

// ─── Types ────────────────────────────────────────────────────────────────────
export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type OrderItem = typeof orderItems.$inferSelect
export type NewOrderItem = typeof orderItems.$inferInsert

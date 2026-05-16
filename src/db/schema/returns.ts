import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies'
import { users } from './auth'
import { orders } from './orders'

export const returnsLog = pgTable('returns_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  orderId: uuid('order_id').references(() => orders.id), 
  orderNumber: text('order_number').notNull(),
  customerName: text('customer_name'),
  shippingAddress: text('shipping_address'),
  scannedAt: timestamp('scanned_at').defaultNow().notNull(),
  processedByUserId: uuid('processed_by_user_id').references(() => users.id),
  metadata: jsonb('metadata'), 
})

export const returnedItems = pgTable('returned_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  returnLogId: uuid('return_log_id').references(() => returnsLog.id, { onDelete: 'cascade' }).notNull(),
  skuOrProductName: text('sku_or_product_name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  condition: text('condition').notNull().default('new'), 
})

export const returnsLogRelations = relations(returnsLog, ({ one, many }) => ({
  company: one(companies, { fields: [returnsLog.companyId], references: [companies.id] }),
  order: one(orders, { fields: [returnsLog.orderId], references: [orders.id] }),
  user: one(users, { fields: [returnsLog.processedByUserId], references: [users.id] }),
  items: many(returnedItems),
}))

export const returnedItemsRelations = relations(returnedItems, ({ one }) => ({
  returnLog: one(returnsLog, { fields: [returnedItems.returnLogId], references: [returnsLog.id] }),
}))

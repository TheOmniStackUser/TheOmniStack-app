import {
  pgTable,
  text,
  uuid,
  timestamp,
  numeric,
  boolean,
  index,
  unique,
  pgEnum,
  AnyPgColumn,
  jsonb,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies'
import { marketplaceEnum } from './orders'

export const priceModifierTypeEnum = pgEnum('price_modifier_type', [
  'none',
  'percentage',
  'fixed',
])

// ─── Products (Central Catalog) ────────────────────────────────────────────────
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  // Parent reference for Variants (if null, it's either a standalone product or a parent)
  parentId: uuid('parent_id').references((): AnyPgColumn => products.id, { onDelete: 'cascade' }),
  
  sku: text('sku').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  ean: text('ean'),
  category: text('category'),
  brand: text('brand'),
  
  // Inventory
  currentStock: numeric('current_stock', { precision: 10, scale: 0 }).notNull().default('0'),
  
  // Pricing
  price: numeric('price', { precision: 12, scale: 2 }).notNull().default('0'),
  purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }),
  msrp: numeric('msrp', { precision: 12, scale: 2 }),
  reducedPrice: numeric('reduced_price', { precision: 12, scale: 2 }),
  
  // Optional Fields
  weight: numeric('weight', { precision: 8, scale: 3 }), // kg
  storageLocation: text('storage_location'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unqCompanySku: unique('unq_company_sku').on(t.companyId, t.sku),
  companyProductsIdx: index('products_company_idx').on(t.companyId),
  parentIdx: index('products_parent_idx').on(t.parentId),
}))

// ─── Product Mappings ────────────────────────────────────────────────────────
// Maps a central product to 1..n marketplace listings
export const productMappings = pgTable('product_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  
  marketplace: marketplaceEnum('marketplace').notNull(),
  marketplaceSku: text('marketplace_sku').notNull(),
  marketplaceProductId: text('marketplace_product_id'), // Some marketplaces have an internal ID (e.g. Shopify Item ID)
  ean: text('ean'),
  
  // Sync Configuration
  syncStock: boolean('sync_stock').notNull().default(true),
  syncPrice: boolean('sync_price').notNull().default(false),
  
  priceModifierType: priceModifierTypeEnum('price_modifier_type').notNull().default('none'),
  priceModifierValue: numeric('price_modifier_value', { precision: 12, scale: 4 }).notNull().default('0'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // A specific listing on a marketplace should only be mapped once per company
  unqMarketplaceListing: unique('unq_company_marketplace_listing').on(t.companyId, t.marketplace, t.marketplaceSku),
  productMappingIdx: index('product_mappings_product_idx').on(t.productId),
}))

// ─── Relations ────────────────────────────────────────────────────────────────
export const productsRelations = relations(products, ({ one, many }) => ({
  company: one(companies, { fields: [products.companyId], references: [companies.id] }),
  parent: one(products, { fields: [products.parentId], references: [products.id], relationName: 'variants' }),
  variants: many(products, { relationName: 'variants' }),
  mappings: many(productMappings),
}))

export const productMappingsRelations = relations(productMappings, ({ one }) => ({
  product: one(products, { fields: [productMappings.productId], references: [products.id] }),
  company: one(companies, { fields: [productMappings.companyId], references: [companies.id] }),
}))

// ─── Unmapped Marketplace Products ─────────────────────────────────────────────
// Stores products fetched from a marketplace that have not yet been mapped
// to a central product or imported as a new central product.
export const unmappedMarketplaceProducts = pgTable('unmapped_marketplace_products', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  
  marketplace: marketplaceEnum('marketplace').notNull(),
  marketplaceSku: text('marketplace_sku').notNull(),
  marketplaceProductId: text('marketplace_product_id'),
  
  title: text('title').notNull(),
  brand: text('brand'),
  price: numeric('price', { precision: 12, scale: 2 }),
  stock: numeric('stock', { precision: 10, scale: 0 }),
  rawPayload: jsonb('raw_payload'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unqUnmappedListing: unique('unq_company_marketplace_unmapped_sku').on(t.companyId, t.marketplace, t.marketplaceSku),
  companyUnmappedIdx: index('unmapped_company_idx').on(t.companyId),
}))

// ─── Types ────────────────────────────────────────────────────────────────────
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type ProductMapping = typeof productMappings.$inferSelect
export type NewProductMapping = typeof productMappings.$inferInsert
export type UnmappedMarketplaceProduct = typeof unmappedMarketplaceProducts.$inferSelect
export type NewUnmappedMarketplaceProduct = typeof unmappedMarketplaceProducts.$inferInsert

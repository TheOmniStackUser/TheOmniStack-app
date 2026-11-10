import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
  jsonb,
  integer,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies'
import { orders } from './orders'
import { marketplaceIntegrations } from './integrations'

// ─── Enums ────────────────────────────────────────────────────────────────────
export const marketplaceQuestionStatusEnum = pgEnum('marketplace_question_status', [
  'open',
  'answered',
  'closed',
])

export const marketplaceQuestionTypeEnum = pgEnum('marketplace_question_type', [
  'product',
  'order',
  'general',
])

export const marketplaceMessageSenderTypeEnum = pgEnum('marketplace_message_sender_type', [
  'customer',
  'seller',
  'system',
])

// ─── Marketplace Questions Table ──────────────────────────────────────────────
export const marketplaceQuestions = pgTable('marketplace_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  marketplace: text('marketplace').notNull().default('otto'), // 'otto', 'kaufland', 'amazon', etc.
  integrationId: uuid('integration_id')
    .references(() => marketplaceIntegrations.id, { onDelete: 'set null' }),
  externalQuestionId: text('external_question_id').notNull(),
  status: marketplaceQuestionStatusEnum('status').notNull().default('open'),
  questionType: marketplaceQuestionTypeEnum('question_type').notNull().default('general'),
  
  // Customer & Target Info
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email'), // Can be masked/encrypted e.g. from OTTO (@otto.de)
  
  // Contextual References
  productSku: text('product_sku'),
  productTitle: text('product_title'),
  marketplaceProductId: text('marketplace_product_id'),
  marketplaceOrderId: text('marketplace_order_id'),
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'set null' }),

  // Question Content
  subject: text('subject').notNull(),
  questionText: text('question_text').notNull(),
  
  // SLA & Penalty Timing
  deadlineAt: timestamp('deadline_at', { withTimezone: true }),
  slaHours: integer('sla_hours').notNull().default(48),

  // Last Answer Snapshot
  lastAnswerText: text('last_answer_text'),
  answeredAt: timestamp('answered_at', { withTimezone: true }),

  // Preserved raw payload for audits and marketplace-specific flags
  rawPayload: jsonb('raw_payload'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Marketplace Question Messages (Thread) ──────────────────────────────────
export const marketplaceQuestionMessages = pgTable('marketplace_question_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id')
    .notNull()
    .references(() => marketplaceQuestions.id, { onDelete: 'cascade' }),
  senderType: marketplaceMessageSenderTypeEnum('sender_type').notNull().default('customer'),
  senderName: text('sender_name').notNull(),
  senderEmail: text('sender_email'),
  messageText: text('message_text').notNull(),
  status: text('status').notNull().default('sent'), // 'sent', 'pending', 'failed'
  externalMessageId: text('external_message_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Relations ────────────────────────────────────────────────────────────────
export const marketplaceQuestionsRelations = relations(marketplaceQuestions, ({ one, many }) => ({
  company: one(companies, {
    fields: [marketplaceQuestions.companyId],
    references: [companies.id],
  }),
  integration: one(marketplaceIntegrations, {
    fields: [marketplaceQuestions.integrationId],
    references: [marketplaceIntegrations.id],
  }),
  order: one(orders, {
    fields: [marketplaceQuestions.orderId],
    references: [orders.id],
  }),
  messages: many(marketplaceQuestionMessages),
}))

export const marketplaceQuestionMessagesRelations = relations(marketplaceQuestionMessages, ({ one }) => ({
  question: one(marketplaceQuestions, {
    fields: [marketplaceQuestionMessages.questionId],
    references: [marketplaceQuestions.id],
  }),
}))

// ─── Types ────────────────────────────────────────────────────────────────────
export type MarketplaceQuestion = typeof marketplaceQuestions.$inferSelect
export type NewMarketplaceQuestion = typeof marketplaceQuestions.$inferInsert
export type MarketplaceQuestionMessage = typeof marketplaceQuestionMessages.$inferSelect
export type NewMarketplaceQuestionMessage = typeof marketplaceQuestionMessages.$inferInsert

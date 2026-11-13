import { db } from '@/db/client'
import { marketplaceQuestions, marketplaceQuestionMessages } from '@/db/schema/questions'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { orders } from '@/db/schema/orders'
import { companies } from '@/db/schema/companies'
import { getAdapterForIntegration } from '@/workers/marketplace-sync'
import { ensureQuestionsTablesExist } from '@/db/ensure-questions-tables'
import { eq, and, or, sql } from 'drizzle-orm'
import type { NormalizedQuestion } from '@/adapters/marketplace/base'

/**
 * Synchronizes customer questions for a specific company across all active marketplace integrations.
 * Persists any newly discovered inquiries into marketplace_questions and marketplace_question_messages.
 */
export async function syncQuestionsForCompany(companyId: string): Promise<{ totalSynced: number }> {
  await ensureQuestionsTablesExist()

  const activeIntegrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, companyId),
        eq(marketplaceIntegrations.isActive, true)
      )
    )

  let totalSynced = 0

  for (const integration of activeIntegrations) {
    const adapter = getAdapterForIntegration(integration)
    if (adapter && typeof adapter.fetchOpenQuestions === 'function') {
      try {
        const fetched: NormalizedQuestion[] = await adapter.fetchOpenQuestions(companyId)

        for (const q of fetched) {
          // Check if question already exists in DB
          const [existing] = await db
            .select({ id: marketplaceQuestions.id, status: marketplaceQuestions.status })
            .from(marketplaceQuestions)
            .where(
              and(
                eq(marketplaceQuestions.companyId, companyId),
                eq(marketplaceQuestions.externalQuestionId, q.externalQuestionId)
              )
            )
            .limit(1)

          if (!existing) {
            // Match order from DB if not already linked
            let matchedOrderId: string | null = null
            if (q.marketplaceOrderId) {
              const [matchedOrder] = await db
                .select({ id: orders.id })
                .from(orders)
                .where(
                  and(
                    eq(orders.companyId, companyId),
                    or(
                      eq(orders.marketplaceOrderId, q.marketplaceOrderId),
                      sql`raw_payload->>'orderNumber' = ${q.marketplaceOrderId}`
                    )
                  )
                )
                .limit(1)

              if (matchedOrder) {
                matchedOrderId = matchedOrder.id
              }
            }

            const [newQuestion] = await db
              .insert(marketplaceQuestions)
              .values({
                companyId,
                marketplace: q.marketplace,
                integrationId: integration.id,
                externalQuestionId: q.externalQuestionId,
                status: q.status || 'open',
                questionType: q.questionType || 'general',
                customerName: q.customerName,
                customerEmail: q.customerEmail || null,
                productSku: q.productSku || null,
                productTitle: q.productTitle || null,
                marketplaceProductId: q.marketplaceProductId || null,
                marketplaceOrderId: q.marketplaceOrderId || null,
                orderId: matchedOrderId,
                subject: q.subject,
                questionText: q.questionText,
                deadlineAt: q.deadlineAt,
                slaHours: q.slaHours || 48,
                rawPayload: q.rawPayload,
                createdAt: q.createdAt || new Date(),
              })
              .returning()

            // Insert initial customer inquiry message into thread
            await db.insert(marketplaceQuestionMessages).values({
              questionId: newQuestion.id,
              senderType: 'customer',
              senderName: q.customerName,
              senderEmail: q.customerEmail || null,
              messageText: q.questionText,
              status: 'received',
              createdAt: q.createdAt || new Date(),
            })

            totalSynced++
          } else if (existing.status !== q.status && q.status) {
            // Sync status update from marketplace (e.g. from open to in_progress)
            await db
              .update(marketplaceQuestions)
              .set({
                status: q.status,
                updatedAt: new Date(),
              })
              .where(eq(marketplaceQuestions.id, existing.id))
          }
        }
      } catch (err) {
        console.error(`[syncQuestionsForCompany] Error syncing for ${integration.type}:`, err)
      }
    }
  }

  return { totalSynced }
}

/**
 * Synchronizes customer questions across all companies that have active marketplace integrations.
 * Intended for the automated background worker (Auto-Abruf) and cron triggers.
 */
export async function syncAllCompaniesQuestions(): Promise<{ totalSynced: number; companiesProcessed: number }> {
  await ensureQuestionsTablesExist()

  const allCompanies = await db.select({ id: companies.id }).from(companies)
  let total = 0
  let count = 0

  for (const comp of allCompanies) {
    try {
      const res = await syncQuestionsForCompany(comp.id)
      total += res.totalSynced
      count++
    } catch (e) {
      console.error(`[syncAllCompaniesQuestions] Failed for company ${comp.id}:`, e)
    }
  }

  return { totalSynced: total, companiesProcessed: count }
}

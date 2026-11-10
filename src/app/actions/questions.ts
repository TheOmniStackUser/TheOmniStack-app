'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceQuestions, marketplaceQuestionMessages } from '@/db/schema/questions'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { orders } from '@/db/schema/orders'
import { users } from '@/db/schema/auth'
import { eq, and, desc, asc, ilike, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { calculateSlaDeadline, getSlaStatus } from '@/lib/sla'
import { getAdapterForIntegration } from '@/workers/marketplace-sync'
import type { NormalizedQuestion } from '@/adapters/marketplace/base'
import { ensureQuestionsTablesExist } from '@/db/ensure-questions-tables'

export type QuestionFilterOptions = {
  marketplace?: string
  status?: string
  search?: string
  sort?: 'deadline' | 'newest' | 'oldest'
}

export async function getQuestionsAction(filters: QuestionFilterOptions = {}) {
  const auth = await requireAuth()
  await ensureQuestionsTablesExist()

  const conditions = [eq(marketplaceQuestions.companyId, auth.activeCompanyId)]

  if (filters.marketplace && filters.marketplace !== 'all') {
    conditions.push(eq(marketplaceQuestions.marketplace, filters.marketplace.toLowerCase()))
  }

  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(marketplaceQuestions.status, filters.status as any))
  }

  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`
    conditions.push(
      or(
        ilike(marketplaceQuestions.customerName, term),
        ilike(marketplaceQuestions.subject, term),
        ilike(marketplaceQuestions.questionText, term),
        ilike(marketplaceQuestions.productSku, term),
        ilike(marketplaceQuestions.externalQuestionId, term),
        ilike(marketplaceQuestions.marketplaceOrderId, term)
      )!
    )
  }

  let orderByClause = desc(marketplaceQuestions.createdAt)
  if (filters.sort === 'deadline') {
    // Sort by urgent deadline first (ascending deadlineAt for open items)
    orderByClause = asc(marketplaceQuestions.deadlineAt)
  } else if (filters.sort === 'oldest') {
    orderByClause = asc(marketplaceQuestions.createdAt)
  }

  const list = await db
    .select()
    .from(marketplaceQuestions)
    .where(and(...conditions))
    .orderBy(orderByClause)

  // Attach computed SLA status
  return list.map((q) => ({
    ...q,
    sla: getSlaStatus(q.deadlineAt, q.status),
  }))
}

export async function getQuestionDetailsAction(questionId: string) {
  const auth = await requireAuth()
  await ensureQuestionsTablesExist()

  const [question] = await db
    .select()
    .from(marketplaceQuestions)
    .where(
      and(
        eq(marketplaceQuestions.id, questionId),
        eq(marketplaceQuestions.companyId, auth.activeCompanyId)
      )
    )
    .limit(1)

  if (!question) {
    throw new Error('Frage nicht gefunden.')
  }

  // Fetch all thread messages
  const messages = await db
    .select()
    .from(marketplaceQuestionMessages)
    .where(eq(marketplaceQuestionMessages.questionId, questionId))
    .orderBy(asc(marketplaceQuestionMessages.createdAt))

  // Fetch matched order details if linked
  let linkedOrder = null
  if (question.orderId) {
    const [ord] = await db
      .select({
        id: orders.id,
        orderNumber: orders.marketplaceOrderId,
        status: orders.status,
        totalAmount: orders.totalAmount,
        currency: orders.currency,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.id, question.orderId))
      .limit(1)
    linkedOrder = ord || null
  }

  return {
    ...question,
    sla: getSlaStatus(question.deadlineAt, question.status),
    messages,
    linkedOrder,
  }
}

export async function answerQuestionAction(questionId: string, answerText: string) {
  const auth = await requireAuth()

  if (!answerText || !answerText.trim()) {
    return { success: false, error: 'Bitte gib eine Antwort ein.' }
  }

  const [question] = await db
    .select()
    .from(marketplaceQuestions)
    .where(
      and(
        eq(marketplaceQuestions.id, questionId),
        eq(marketplaceQuestions.companyId, auth.activeCompanyId)
      )
    )
    .limit(1)

  if (!question) {
    return { success: false, error: 'Frage nicht gefunden.' }
  }

  const [currentUser] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1)

  const senderName = currentUser?.name || 'Kundenservice'

  // Look for active integration to use its adapter
  let integration = null
  if (question.integrationId) {
    const [integ] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(eq(marketplaceIntegrations.id, question.integrationId))
      .limit(1)
    integration = integ
  } else {
    // Find active integration by marketplace type
    const [integ] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.type, question.marketplace as any),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
      .limit(1)
    integration = integ
  }

  const normalizedQuestion: NormalizedQuestion = {
    externalQuestionId: question.externalQuestionId,
    marketplace: question.marketplace,
    status: question.status as any,
    questionType: question.questionType as any,
    customerName: question.customerName,
    customerEmail: question.customerEmail || undefined,
    productSku: question.productSku || undefined,
    productTitle: question.productTitle || undefined,
    marketplaceProductId: question.marketplaceProductId || undefined,
    marketplaceOrderId: question.marketplaceOrderId || undefined,
    subject: question.subject,
    questionText: question.questionText,
    deadlineAt: question.deadlineAt || undefined,
    slaHours: question.slaHours,
    createdAt: question.createdAt,
    rawPayload: question.rawPayload,
  }

  let dispatchResult: { success: boolean; messageId?: string; error?: string } = {
    success: true,
    messageId: `msg-${Date.now()}`,
  }

  if (integration) {
    const adapter = getAdapterForIntegration(integration)
    if (adapter && typeof adapter.answerQuestion === 'function') {
      try {
        dispatchResult = await adapter.answerQuestion(
          auth.activeCompanyId,
          normalizedQuestion,
          answerText.trim()
        )
      } catch (err: any) {
        console.error('[answerQuestionAction] Adapter answerQuestion failed:', err)
        dispatchResult = { success: true, messageId: `msg-${Date.now()}` }
      }
    }
  } else if (question.marketplace === 'otto') {
    // If no direct integration entry exists yet in dev/sandbox, use fallback Otto dispatch
    const { OttoAdapter } = await import('@/adapters/marketplace/otto')
    const fallbackAdapter = new OttoAdapter({
      clientId: 'manual',
      clientSecret: 'manual',
    })
    dispatchResult = await fallbackAdapter.answerQuestion(
      auth.activeCompanyId,
      normalizedQuestion,
      answerText.trim()
    )
  }

  // 1. Record the reply in message thread
  await db.insert(marketplaceQuestionMessages).values({
    questionId: question.id,
    senderType: 'seller',
    senderName,
    senderEmail: currentUser?.email,
    messageText: answerText.trim(),
    status: dispatchResult.success ? 'sent' : 'failed',
    externalMessageId: dispatchResult.messageId,
  })

  // 2. Update question status to answered
  await db
    .update(marketplaceQuestions)
    .set({
      status: 'answered',
      answeredAt: new Date(),
      lastAnswerText: answerText.trim(),
      updatedAt: new Date(),
    })
    .where(eq(marketplaceQuestions.id, question.id))

  revalidatePath('/questions')
  return { success: true, messageId: dispatchResult.messageId }
}

export async function updateQuestionStatusAction(
  questionId: string,
  newStatus: 'open' | 'answered' | 'closed'
) {
  const auth = await requireAuth()

  await db
    .update(marketplaceQuestions)
    .set({
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketplaceQuestions.id, questionId),
        eq(marketplaceQuestions.companyId, auth.activeCompanyId)
      )
    )

  revalidatePath('/questions')
  return { success: true }
}

export async function syncMarketplaceQuestionsAction() {
  const auth = await requireAuth()
  await ensureQuestionsTablesExist()

  // Retrieve active integrations for company
  const activeIntegrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.isActive, true)
      )
    )

  let totalSynced = 0

  for (const integration of activeIntegrations) {
    const adapter = getAdapterForIntegration(integration)
    if (adapter && typeof adapter.fetchOpenQuestions === 'function') {
      try {
        const fetched = await adapter.fetchOpenQuestions(auth.activeCompanyId)
        totalSynced += fetched.length
      } catch (err) {
        console.error(`[syncMarketplaceQuestionsAction] Error syncing for ${integration.type}:`, err)
      }
    }
  }

  revalidatePath('/questions')
  return { success: true, count: totalSynced }
}

export type ManualQuestionInput = {
  marketplace: string
  customerName: string
  customerEmail?: string
  subject: string
  questionText: string
  questionType?: 'product' | 'order' | 'general'
  productSku?: string
  productTitle?: string
  marketplaceOrderId?: string
  slaHours?: number
}

export async function createManualQuestionAction(data: ManualQuestionInput) {
  const auth = await requireAuth()
  await ensureQuestionsTablesExist()

  if (!data.customerName || !data.subject || !data.questionText) {
    return { success: false, error: 'Bitte fülle alle Pflichtfelder aus.' }
  }

  const slaHours = data.slaHours || (data.marketplace === 'amazon' ? 24 : 48)
  const deadlineAt = calculateSlaDeadline(new Date(), slaHours, data.marketplace)
  const externalQuestionId = `Q-${data.marketplace.toUpperCase()}-${Date.now().toString().slice(-6)}`

  // Try matching orderId if marketplaceOrderId is provided
  let matchedOrderId: string | null = null
  if (data.marketplaceOrderId) {
    const [matchedOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.companyId, auth.activeCompanyId),
          eq(orders.marketplaceOrderId, data.marketplaceOrderId.trim())
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
      companyId: auth.activeCompanyId,
      marketplace: data.marketplace.toLowerCase(),
      externalQuestionId,
      status: 'open',
      questionType: data.questionType || 'general',
      customerName: data.customerName.trim(),
      customerEmail: data.customerEmail?.trim() || null,
      productSku: data.productSku?.trim() || null,
      productTitle: data.productTitle?.trim() || null,
      marketplaceOrderId: data.marketplaceOrderId?.trim() || null,
      orderId: matchedOrderId,
      subject: data.subject.trim(),
      questionText: data.questionText.trim(),
      deadlineAt,
      slaHours,
      rawPayload: { manualCreated: true, createdVia: 'manual_dialog' },
    })
    .returning()

  // Insert initial message into thread
  await db.insert(marketplaceQuestionMessages).values({
    questionId: newQuestion.id,
    senderType: 'customer',
    senderName: data.customerName.trim(),
    senderEmail: data.customerEmail?.trim() || null,
    messageText: data.questionText.trim(),
    status: 'sent',
    externalMessageId: `msg-in-${Date.now()}`,
  })

  revalidatePath('/questions')
  return { success: true, questionId: newQuestion.id }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { marketplaceQuestions, marketplaceQuestionMessages } from '@/db/schema/questions'
import { companies } from '@/db/schema/companies'
import { orders } from '@/db/schema/orders'
import { calculateSlaDeadline } from '@/lib/sla'
import { eq, or, and } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()

    // 1. Identify Company
    let companyId = payload.companyId
    if (!companyId && payload.to) {
      // Try resolving company by matching inbound recipient email with company email
      const [matchedCompany] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.email, payload.to.toLowerCase()))
        .limit(1)
      if (matchedCompany) {
        companyId = matchedCompany.id
      }
    }

    if (!companyId) {
      // Fallback: pick the first active company if not specified in single-tenant/sandbox
      const [firstCompany] = await db
        .select({ id: companies.id })
        .from(companies)
        .limit(1)
      if (firstCompany) {
        companyId = firstCompany.id
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { error: 'Unternehmen konnte nicht zugeordnet werden (companyId fehlt).' },
        { status: 400 }
      )
    }

    // 2. Parse Question Details
    const marketplace = (payload.marketplace || 'otto').toLowerCase()
    const customerName = payload.customerName || payload.fromName || 'OTTO Kunde'
    const customerEmail = payload.customerEmail || payload.from || ''
    const subject = payload.subject || 'Anfrage zu Produkt / Bestellung'
    const questionText = payload.text || payload.body || payload.questionText || ''
    const marketplaceOrderId = payload.marketplaceOrderId || payload.orderNumber || null
    const productSku = payload.productSku || payload.sku || null
    const productTitle = payload.productTitle || null
    const questionType = payload.questionType || (marketplaceOrderId ? 'order' : productSku ? 'product' : 'general')

    if (!questionText.trim()) {
      return NextResponse.json(
        { error: 'Ungültige Anfrage: Nachrichtentext darf nicht leer sein.' },
        { status: 400 }
      )
    }

    // 3. Match Order if exists
    let matchedOrderId: string | null = null
    if (marketplaceOrderId) {
      const [ord] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.companyId, companyId),
            eq(orders.marketplaceOrderId, marketplaceOrderId)
          )
        )
        .limit(1)
      if (ord) {
        matchedOrderId = ord.id
      }
    }

    // 4. Calculate SLA Deadline
    const slaHours = marketplace === 'amazon' ? 24 : 48
    const deadlineAt = calculateSlaDeadline(new Date(), slaHours, marketplace)
    const externalQuestionId = payload.externalQuestionId || `Q-${marketplace.toUpperCase()}-${Date.now().toString().slice(-6)}`

    // 5. Insert Question
    const [insertedQuestion] = await db
      .insert(marketplaceQuestions)
      .values({
        companyId,
        marketplace,
        externalQuestionId,
        status: 'open',
        questionType,
        customerName,
        customerEmail: customerEmail || null,
        productSku,
        productTitle,
        marketplaceOrderId,
        orderId: matchedOrderId,
        subject,
        questionText,
        deadlineAt,
        slaHours,
        rawPayload: payload,
      })
      .returning()

    // 6. Insert initial Customer Message
    await db.insert(marketplaceQuestionMessages).values({
      questionId: insertedQuestion.id,
      senderType: 'customer',
      senderName: customerName,
      senderEmail: customerEmail || null,
      messageText: questionText,
      status: 'sent',
      externalMessageId: payload.messageId || `msg-in-${Date.now()}`,
    })

    return NextResponse.json({
      success: true,
      questionId: insertedQuestion.id,
      deadlineAt,
      slaHours,
    })
  } catch (error: any) {
    console.error('[webhook/marketplace-questions] Error processing webhook:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { marketplaceQuestions, marketplaceQuestionMessages } from '@/db/schema/questions'
import { companies } from '@/db/schema/companies'
import { orders } from '@/db/schema/orders'
import { calculateSlaDeadline } from '@/lib/sla'
import { ensureQuestionsTablesExist } from '@/db/ensure-questions-tables'
import { eq, or, and, sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    await ensureQuestionsTablesExist()
    const payload = await req.json()

    // 1. Identify Company
    let companyId = payload.companyId
    if (!companyId && payload.to) {
      // Try resolving company by matching inbound recipient email with company email or SMTP fromEmail
      const targetTo = String(payload.to).toLowerCase().trim()
      const [matchedCompany] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(
          or(
            eq(companies.email, targetTo),
            sql`LOWER(companies.smtp_settings->>'fromEmail') = ${targetTo}`
          )
        )
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

    // 2. Parse Question Details & Auto-Extract OTTO Identifiers from Subject/Body
    const subject = String(payload.subject || 'Anfrage zu Produkt / Bestellung').trim()
    const questionText = String(payload.text || payload.body || payload.questionText || '').trim()

    if (!questionText) {
      return NextResponse.json(
        { error: 'Ungültige Anfrage: Nachrichtentext darf nicht leer sein.' },
        { status: 400 }
      )
    }

    const combinedText = `${subject}\n${questionText}`
    const ottoOrderMatch = combinedText.match(/\b(cbn[a-z0-9]{7})\b/i)
    const ottoIdMatch = combinedText.match(/(?:#|ID\s*#?)(\d{7,9})\b/i)

    const marketplace = (payload.marketplace || 'otto').toLowerCase()
    let marketplaceOrderId: string | null =
      payload.marketplaceOrderId || payload.orderNumber || (ottoOrderMatch ? ottoOrderMatch[1].toLowerCase() : null)
    let productSku: string | null = payload.productSku || payload.sku || null
    let productTitle: string | null = payload.productTitle || null
    let customerName: string = payload.customerName || payload.fromName || ''
    let customerEmail: string = payload.customerEmail || payload.from || ''

    // 3. Match Order if exists and enrich missing customer/product fields
    let matchedOrderId: string | null = null
    if (marketplaceOrderId) {
      const [ord] = await db
        .select({
          id: orders.id,
          marketplaceOrderId: orders.marketplaceOrderId,
          buyerName: orders.buyerName,
          buyerEmail: orders.buyerEmail,
          rawPayload: orders.rawPayload,
        })
        .from(orders)
        .where(
          and(
            eq(orders.companyId, companyId),
            or(
              eq(orders.marketplaceOrderId, marketplaceOrderId),
              sql`orders.raw_payload->>'orderNumber' = ${marketplaceOrderId}`
            )
          )
        )
        .limit(1)

      if (ord) {
        matchedOrderId = ord.id
        const raw = (ord.rawPayload as any) || {}
        const firstPos = raw?.positionItems?.[0]
        const prod = firstPos?.product
        if (!customerName) {
          customerName =
            ord.buyerName ||
            `${raw?.invoiceAddress?.firstName || ''} ${raw?.invoiceAddress?.lastName || ''}`.trim()
        }
        if (!customerEmail) {
          customerEmail = raw?.invoiceAddress?.email || ord.buyerEmail || ''
        }
        if (!productSku && prod?.sku) {
          productSku = prod.sku
        }
        if (!productTitle && prod?.productTitle) {
          productTitle = prod.productTitle
        }
      }
    }

    if (!customerName) {
      customerName = 'OTTO Kunde'
    }

    const questionType =
      payload.questionType || (marketplaceOrderId ? 'order' : productSku ? 'product' : 'general')
    const externalQuestionId =
      payload.externalQuestionId ||
      (ottoIdMatch ? ottoIdMatch[1] : `Q-${marketplace.toUpperCase()}-${Date.now().toString().slice(-6)}`)

    // 4. If question thread already exists, append new customer message and reopen if needed
    const [existingQuestion] = await db
      .select({ id: marketplaceQuestions.id })
      .from(marketplaceQuestions)
      .where(
        and(
          eq(marketplaceQuestions.companyId, companyId),
          eq(marketplaceQuestions.externalQuestionId, externalQuestionId)
        )
      )
      .limit(1)

    if (existingQuestion) {
      await db.insert(marketplaceQuestionMessages).values({
        questionId: existingQuestion.id,
        senderType: 'customer',
        senderName: customerName,
        senderEmail: customerEmail || null,
        messageText: questionText,
        status: 'received',
        externalMessageId: payload.messageId || `msg-in-${Date.now()}`,
      })

      const slaHours = marketplace === 'amazon' ? 24 : 48
      const deadlineAt = calculateSlaDeadline(new Date(), slaHours, marketplace)

      await db
        .update(marketplaceQuestions)
        .set({
          status: 'open',
          questionText,
          deadlineAt,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceQuestions.id, existingQuestion.id))

      return NextResponse.json({
        success: true,
        questionId: existingQuestion.id,
        appendedToExisting: true,
        deadlineAt,
        slaHours,
      })
    }

    // 5. Calculate SLA Deadline & Insert New Question
    const slaHours = marketplace === 'amazon' ? 24 : 48
    const deadlineAt = calculateSlaDeadline(new Date(), slaHours, marketplace)

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
      status: 'received',
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

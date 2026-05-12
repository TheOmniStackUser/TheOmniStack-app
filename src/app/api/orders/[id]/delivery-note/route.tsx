import { requireAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'
import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { companies } from '@/db/schema/companies'
import { eq, and } from 'drizzle-orm'
import { renderToStream } from '@react-pdf/renderer'
import { DeliveryNoteDocument } from '@/components/pdf/delivery-note'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    const { id } = await context.params

    // 1. Fetch Order
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.companyId, auth.activeCompanyId)))
      .limit(1)

    if (!order) {
      return new Response('Order not found', { status: 404 })
    }

    // 2. Fetch Order Items
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))

    const orderWithItems = { ...order, items }

    // 3. Fetch Company details
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)

    if (!company) {
      return new Response('Company not found', { status: 404 })
    }

    // ─── Special Case: About You ─────────────────────────────────────────────
    // About You requires using their official delivery documents.
    if (order.marketplace === 'aboutyou') {
      const { marketplaceIntegrations } = await import('@/db/schema/integrations')
      const [integration] = await db
        .select()
        .from(marketplaceIntegrations)
        .where(and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.type, 'aboutyou'),
          eq(marketplaceIntegrations.isActive, true)
        ))
        .limit(1)

      if (integration?.apiKey) {
        const { AboutYouAdapter } = await import('@/adapters/marketplace/aboutyou')
        const adapter = new AboutYouAdapter({
          apiKey: integration.apiKey,
          environment: (integration.environment as any) || 'production'
        })
        
        try {
          const pdfBuffer = await adapter.getDeliveryNote(order.marketplaceOrderId)
          return new Response(new Uint8Array(pdfBuffer), {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="AboutYou_Lieferschein_${order.marketplaceOrderId}.pdf"`,
            },
          })
        } catch (aboutYouError) {
          console.error('[DeliveryNoteRoute] Error fetching About You doc:', aboutYouError)
          // Fallback to generating our own if About You API fails? 
          // User said "must use About You", so maybe we should error here.
          // But for now, let's fall back so they have SOMETHING, or maybe just error.
          return new Response('Original-Lieferschein von About You konnte nicht geladen werden.', { status: 502 })
        }
      }
    }

    let customerNumber = order.customerNumber
    let deliveryNoteNumber = order.deliveryNoteNumber
    let companyUpdates: any = {}

    if (!customerNumber) {
      if (order.buyerEmail) {
        const [existing] = await db
          .select({ customerNumber: orders.customerNumber })
          .from(orders)
          .where(and(eq(orders.companyId, auth.activeCompanyId), eq(orders.buyerEmail, order.buyerEmail)))
          .limit(1)
        
        // This is a naive check (might grab a row where customerNumber is null), so let's refine:
      }
      
      // Let's just do a proper fetch:
      let existingCustomerNumber = null;
      if (order.buyerEmail) {
        const allOrdersForEmail = await db
          .select({ customerNumber: orders.customerNumber })
          .from(orders)
          .where(and(eq(orders.companyId, auth.activeCompanyId), eq(orders.buyerEmail, order.buyerEmail)))
        
        const withNum = allOrdersForEmail.find(o => o.customerNumber !== null)
        if (withNum) existingCustomerNumber = withNum.customerNumber
      }

      if (existingCustomerNumber) {
        customerNumber = existingCustomerNumber
      } else {
        customerNumber = company.nextCustomerNumber
        companyUpdates.nextCustomerNumber = String(Number(company.nextCustomerNumber) + 1)
      }
    }

    if (!deliveryNoteNumber) {
       deliveryNoteNumber = company.nextDeliveryNoteNumber
       companyUpdates.nextDeliveryNoteNumber = String(Number(company.nextDeliveryNoteNumber) + 1)
    }

    if (!order.customerNumber || !order.deliveryNoteNumber) {
      await db.update(orders)
        .set({ customerNumber, deliveryNoteNumber })
        .where(eq(orders.id, order.id))
        
      if (Object.keys(companyUpdates).length > 0) {
        await db.update(companies)
          .set(companyUpdates)
          .where(eq(companies.id, company.id))
      }
      
      orderWithItems.customerNumber = customerNumber
      orderWithItems.deliveryNoteNumber = deliveryNoteNumber
    }

    // 4. Render PDF
    const stream = await renderToStream(<DeliveryNoteDocument order={orderWithItems} company={company} />)

    // Convert NodeJS Readable stream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk))
        stream.on('end', () => controller.close())
        stream.on('error', (err) => controller.error(err))
      }
    })

    return new Response(webStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Lieferschein_${order.marketplaceOrderId || order.id}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('Error generating delivery note PDF:', error)
    return new Response(error.message || 'Internal Server Error', { status: 500 })
  }
}

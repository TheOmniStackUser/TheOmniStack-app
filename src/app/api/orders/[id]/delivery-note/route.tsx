import { requireAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'
import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { companies } from '@/db/schema/companies'
import { eq, and } from 'drizzle-orm'
import { renderToStream } from '@react-pdf/renderer'
import { DeliveryNoteDocument } from '@/components/pdf/delivery-note'
import { documentExists, downloadDocument, uploadDocument, buildDeliveryNoteKey } from '@/lib/storage'

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', (err) => reject(err))
  })
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    const { id } = await context.params

    // 1. Check cache first (Measure 4: PDF Caching)
    const cacheKey = buildDeliveryNoteKey(auth.activeCompanyId, id)
    try {
      const cached = await documentExists(cacheKey)
      if (cached) {
        console.log(`[DeliveryNoteRoute] Cache hit for order ${id}`)
        const pdfBuffer = await downloadDocument(cacheKey)
        return new Response(new Uint8Array(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="Lieferschein_${id}.pdf"`,
          },
        })
      }
    } catch (cacheErr) {
      console.warn(`[DeliveryNoteRoute] Cache check failed for order ${id}:`, cacheErr)
    }

    // 2. Fetch Order
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.companyId, auth.activeCompanyId)))
      .limit(1)

    if (!order) {
      return new Response('Order not found', { status: 404 })
    }

    // 3. Fetch Order Items
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))

    const orderWithItems = { ...order, items }

    // 4. Fetch Company details
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)

    if (!company) {
      return new Response('Company not found', { status: 404 })
    }

    // ─── Special Case: Marketplace Integrations with Delivery Notes ──────────
    // About You and Mirakl (e.g. Limango) can provide official delivery documents.
    if (order.marketplace === 'aboutyou' || order.marketplace === 'limango') {
      const { marketplaceIntegrations } = await import('@/db/schema/integrations')
      
      const activeIntegrations = await db
        .select()
        .from(marketplaceIntegrations)
        .where(and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.isActive, true)
        ))

      const integration = activeIntegrations.find(i => 
        i.type === order.marketplace || 
        (i.type === 'mirakl_custom' && ((i.metadata as any)?.customName || '').toLowerCase() === order.marketplace.toLowerCase())
      )

      if (integration) {
        let adapter: any = null
        if (integration.type === 'aboutyou' && integration.apiKey) {
          const { AboutYouAdapter } = await import('@/adapters/marketplace/aboutyou')
          adapter = new AboutYouAdapter({
            apiKey: integration.apiKey,
            environment: (integration.environment as any) || 'production'
          })
        } else if ((integration.type.startsWith('mirakl_') || integration.type === 'mirakl_custom') && integration.clientId) {
          const { MiraklAdapter } = await import('@/adapters/marketplace/mirakl')
          const customName = integration.type === 'mirakl_custom'
            ? ((integration.metadata as any)?.customName || 'mirakl_custom')
            : integration.type
          adapter = new MiraklAdapter({
            instance: customName.toLowerCase() as any,
            baseUrl: integration.environment!,
            clientId: integration.clientId,
            clientSecret: integration.clientSecret || '',
            apiKey: integration.apiKey || undefined,
            shopId: (integration.metadata as any)?.shopId || undefined
          })
        }

        if (adapter && adapter.getDeliveryNote) {
          try {
            const pdfBuffer = await adapter.getDeliveryNote(order.marketplaceOrderId)
            
            if (pdfBuffer) {
              // Cache the fetched PDF
              try {
                await uploadDocument(cacheKey, pdfBuffer)
              } catch (uploadErr) {
                console.warn(`[DeliveryNoteRoute] Cache save failed for marketplace order ${id}:`, uploadErr)
              }

              const displayMarketplace = integration.type === 'mirakl_custom' 
                ? ((integration.metadata as any)?.customName || 'Mirakl') 
                : (integration.type === 'aboutyou' ? 'AboutYou' : 'Mirakl')

              return new Response(new Uint8Array(pdfBuffer), {
                headers: {
                  'Content-Type': 'application/pdf',
                  'Content-Disposition': `inline; filename="${displayMarketplace}_Lieferschein_${order.marketplaceOrderId}.pdf"`,
                },
              })
            } else {
              console.log(`[DeliveryNoteRoute] No official delivery note found for order ${id}. Falling back to local generation.`)
            }
          } catch (adapterError) {
            console.error('[DeliveryNoteRoute] Error fetching marketplace doc:', adapterError)
            if (integration.type === 'aboutyou') {
              return new Response('Original-Lieferschein von About You konnte nicht geladen werden.', { status: 502 })
            } else {
              console.log(`[DeliveryNoteRoute] Falling back to local generation for Mirakl order ${id}.`)
            }
          }
        }
      }
    }

    let customerNumber = order.customerNumber
    let deliveryNoteNumber = order.deliveryNoteNumber
    let companyUpdates: any = {}

    if (!customerNumber) {
      // Let's do a proper fetch:
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

    // 5. Render PDF
    const stream = await renderToStream(<DeliveryNoteDocument order={orderWithItems} company={company} />)
    const pdfBuffer = await streamToBuffer(stream)

    // Cache the newly generated PDF
    try {
      await uploadDocument(cacheKey, pdfBuffer)
    } catch (uploadErr) {
      console.warn(`[DeliveryNoteRoute] Cache save failed for generated order ${id}:`, uploadErr)
    }

    return new Response(new Uint8Array(pdfBuffer), {
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

import { requireAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'
import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { companies } from '@/db/schema/companies'
import { eq, and, inArray } from 'drizzle-orm'
import { renderToStream } from '@react-pdf/renderer'
import { DeliveryNoteDocument } from '@/components/pdf/delivery-note'
import { PDFDocument } from 'pdf-lib'

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', (err) => reject(err))
  })
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth()
    const { searchParams } = new URL(request.url)
    const idsString = searchParams.get('ids')
    
    if (!idsString) {
      return new Response('No IDs provided', { status: 400 })
    }

    const ids = idsString.split(',').filter(id => id.length > 0)
    if (ids.length === 0) {
      return new Response('No valid IDs provided', { status: 400 })
    }

    // 1. Fetch Company details
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)

    if (!company) {
      return new Response('Company not found', { status: 404 })
    }

    // 2. Fetch Orders with Items
    const ordersData = await db
      .select()
      .from(orders)
      .where(and(
        inArray(orders.id, ids),
        eq(orders.companyId, auth.activeCompanyId)
      ))

    // Sort ordersData to match the requested ids order
    const ordersMap = new Map(ordersData.map(o => [o.id, o]))
    const sortedOrders = ids.map(id => ordersMap.get(id)).filter((o): o is typeof ordersData[number] => !!o)

    if (sortedOrders.length === 0) {
      return new Response('No orders found', { status: 404 })
    }

    // 3. Check for About You integration if needed
    const hasAboutYou = sortedOrders.some(o => o.marketplace === 'aboutyou')
    let aboutYouAdapter: any = null
    if (hasAboutYou) {
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
        aboutYouAdapter = new AboutYouAdapter({
          apiKey: integration.apiKey,
          environment: (integration.environment as any) || 'production'
        })
      }
    }

    // 4. Process and generate numbers
    const ordersWithItems = []
    let nextCustomerNumber = Number(company.nextCustomerNumber)
    let nextDeliveryNoteNumber = Number(company.nextDeliveryNoteNumber)
    let companyUpdated = false

    for (const order of sortedOrders) {
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id))

      let customerNumber = order.customerNumber
      let deliveryNoteNumber = order.deliveryNoteNumber
      let orderUpdated = false

      if (!customerNumber) {
        customerNumber = String(nextCustomerNumber++)
        orderUpdated = true
        companyUpdated = true
      }

      if (!deliveryNoteNumber) {
        deliveryNoteNumber = String(nextDeliveryNoteNumber++)
        orderUpdated = true
        companyUpdated = true
      }

      if (orderUpdated) {
        await db.update(orders)
          .set({ customerNumber, deliveryNoteNumber })
          .where(eq(orders.id, order.id))
      }

      ordersWithItems.push({ ...order, items, customerNumber, deliveryNoteNumber })
    }

    if (companyUpdated) {
      await db.update(companies)
        .set({ 
          nextCustomerNumber: String(nextCustomerNumber),
          nextDeliveryNoteNumber: String(nextDeliveryNoteNumber)
        })
        .where(eq(companies.id, company.id))
    }

    // 5. Render/Fetch PDFs
    const pdfBuffers: Buffer[] = []
    for (const order of ordersWithItems) {
      if (order.marketplace === 'aboutyou') {
        if (!aboutYouAdapter) {
          return new Response(`About You Integration ist nicht konfiguriert für Bestellung ${order.marketplaceOrderId}`, { status: 400 })
        }
        try {
          const pdfBuffer = await aboutYouAdapter.getDeliveryNote(order.marketplaceOrderId)
          pdfBuffers.push(pdfBuffer)
        } catch (aboutYouError: any) {
          console.error(`[DeliveryNoteRoute] Error fetching About You doc for ${order.marketplaceOrderId}:`, aboutYouError)
          return new Response(`Original-Lieferschein von About You für Bestellung ${order.marketplaceOrderId} konnte nicht geladen werden: ${aboutYouError.message}`, { status: 502 })
        }
      } else {
        const stream = await renderToStream(<DeliveryNoteDocument order={order} company={company} />)
        const pdfBuffer = await streamToBuffer(stream)
        pdfBuffers.push(pdfBuffer)
      }
    }

    // 6. Merge the PDFs using pdf-lib
    const mergedPdf = await PDFDocument.create()

    for (const buffer of pdfBuffers) {
      try {
        const srcPdf = await PDFDocument.load(buffer)
        const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices())
        copiedPages.forEach((page: any) => mergedPdf.addPage(page))
      } catch (err: any) {
        console.error('Fehler beim Zusammenführen eines PDFs:', err)
        return new Response(`Fehler beim Zusammenführen der Lieferscheine: ${err.message}`, { status: 500 })
      }
    }

    const mergedPdfBytes = await mergedPdf.save()

    return new Response(new Uint8Array(mergedPdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Lieferscheine_Sammel_Batch.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('Error generating bulk delivery notes PDF:', error)
    return new Response(error.message || 'Internal Server Error', { status: 500 })
  }
}

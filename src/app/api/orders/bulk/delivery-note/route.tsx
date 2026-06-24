import { requireAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'
import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { companies } from '@/db/schema/companies'
import { eq, and, inArray } from 'drizzle-orm'
import { renderToStream } from '@react-pdf/renderer'
import { DeliveryNoteDocument } from '@/components/pdf/delivery-note'
import { PDFDocument } from 'pdf-lib'
import { documentExists, downloadDocument, uploadDocument, buildDeliveryNoteKey } from '@/lib/storage'

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

    // 2. Fetch Orders (Fast Batch Fetch)
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

    // 3. Batch Fetch Order Items upfront (Measure 3: Relational pre-fetching)
    const allItems = await db
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, ids))

    const itemsByOrderId = new Map<string, typeof allItems>()
    for (const item of allItems) {
      if (!itemsByOrderId.has(item.orderId)) {
        itemsByOrderId.set(item.orderId, [])
      }
      itemsByOrderId.get(item.orderId)!.push(item)
    }

    // 4. Check for Marketplace Integrations (About You, Mirakl)
    const hasMarketplaceDocs = sortedOrders.some(o => o.marketplace === 'aboutyou' || o.marketplace === 'limango')
    let adaptersByMarketplace: Record<string, any> = {}
    
    if (hasMarketplaceDocs) {
      const { marketplaceIntegrations } = await import('@/db/schema/integrations')
      const activeIntegrations = await db
        .select()
        .from(marketplaceIntegrations)
        .where(and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.isActive, true)
        ))

      for (const integration of activeIntegrations) {
        if (integration.type === 'aboutyou' && integration.apiKey) {
          const { AboutYouAdapter } = await import('@/adapters/marketplace/aboutyou')
          adaptersByMarketplace['aboutyou'] = new AboutYouAdapter({
            apiKey: integration.apiKey,
            environment: (integration.environment as any) || 'production'
          })
        } else if ((integration.type.startsWith('mirakl_') || integration.type === 'mirakl_custom') && integration.clientId) {
          const { MiraklAdapter } = await import('@/adapters/marketplace/mirakl')
          const customName = integration.type === 'mirakl_custom'
            ? ((integration.metadata as any)?.customName || 'mirakl_custom')
            : integration.type
          adaptersByMarketplace[customName.toLowerCase()] = new MiraklAdapter({
            instance: customName.toLowerCase() as any,
            baseUrl: integration.environment!,
            clientId: integration.clientId,
            clientSecret: integration.clientSecret || '',
            apiKey: integration.apiKey || undefined,
            shopId: (integration.metadata as any)?.shopId || undefined
          })
        }
      }
    }

    // 5. Process and generate numbers
    const ordersWithItems = []
    let nextCustomerNumber = Number(company.nextCustomerNumber)
    let nextDeliveryNoteNumber = Number(company.nextDeliveryNoteNumber)
    let companyUpdated = false

    for (const order of sortedOrders) {
      const items = itemsByOrderId.get(order.id) || []

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

    // 6. Render/Fetch/Cache PDFs (Measure 4: PDF Caching)
    const pdfBuffers: Buffer[] = []
    for (const order of ordersWithItems) {
      const cacheKey = buildDeliveryNoteKey(auth.activeCompanyId, order.id)

      try {
        const cached = await documentExists(cacheKey)
        if (cached) {
          console.log(`[DeliveryNoteRoute] Cache hit for order ${order.id}`)
          const pdfBuffer = await downloadDocument(cacheKey)
          pdfBuffers.push(pdfBuffer)
          continue
        }
      } catch (cacheErr) {
        console.warn(`[DeliveryNoteRoute] Cache check failed for order ${order.id}:`, cacheErr)
      }

      if (order.marketplace === 'aboutyou' || order.marketplace === 'limango') {
        const adapter = adaptersByMarketplace[order.marketplace.toLowerCase()]
        if (adapter && adapter.getDeliveryNote) {
          try {
            const pdfBuffer = await adapter.getDeliveryNote(order.marketplaceOrderId)
            if (pdfBuffer) {
              pdfBuffers.push(pdfBuffer)
              
              // Cache the fetched PDF
              try {
                await uploadDocument(cacheKey, pdfBuffer)
              } catch (uploadErr) {
                console.warn(`[DeliveryNoteRoute] Cache save failed for marketplace order ${order.id}:`, uploadErr)
              }
              continue // Successfully added the marketplace pdf, skip local generation
            } else {
              console.log(`[DeliveryNoteRoute] No official delivery note found for order ${order.marketplaceOrderId}. Falling back to local generation.`)
            }
          } catch (adapterError: any) {
            console.error(`[DeliveryNoteRoute] Error fetching marketplace doc for ${order.marketplaceOrderId}:`, adapterError)
            if (order.marketplace === 'aboutyou') {
              return new Response(`Original-Lieferschein von About You für Bestellung ${order.marketplaceOrderId} konnte nicht geladen werden: ${adapterError.message}`, { status: 502 })
            } else {
              console.log(`[DeliveryNoteRoute] Falling back to local generation for Mirakl order ${order.id}.`)
            }
          }
        } else if (order.marketplace === 'aboutyou') {
          return new Response(`About You Integration ist nicht konfiguriert für Bestellung ${order.marketplaceOrderId}`, { status: 400 })
        }
      }

      // Local Generation (Fallback or default)
      const stream = await renderToStream(<DeliveryNoteDocument order={order} company={company} />)
      const pdfBuffer = await streamToBuffer(stream)
      pdfBuffers.push(pdfBuffer)

      // Cache the newly generated PDF
      try {
        await uploadDocument(cacheKey, pdfBuffer)
      } catch (uploadErr) {
        console.warn(`[DeliveryNoteRoute] Cache save failed for generated order ${order.id}:`, uploadErr)
      }
    }

    // 7. Merge the PDFs using pdf-lib
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

    const today = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = formatter.formatToParts(today)
    const year = parts.find(p => p.type === 'year')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const day = parts.find(p => p.type === 'day')?.value
    const dateStr = `${year}-${month}-${day}`

    return new Response(new Uint8Array(mergedPdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Lieferscheine_Sammel_Batch_${dateStr}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('Error generating bulk delivery notes PDF:', error)
    return new Response(error.message || 'Internal Server Error', { status: 500 })
  }
}

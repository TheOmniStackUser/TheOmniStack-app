import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { companies } from '@/db/schema/companies'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and, inArray } from 'drizzle-orm'
import { PDFDocument } from 'pdf-lib'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { DeliveryNoteDocument } from '@/components/pdf/delivery-note'
import {
  documentExists,
  downloadDocument,
  uploadDocument,
  buildDeliveryNoteKey,
} from '@/lib/storage'
import { formatDocumentNumber, getDefaultSettings } from '@/lib/invoice-service'

function getBerlinDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}

export async function getOrGenerateDeliveryNotePdf(
  orderId: string,
  companyId: string
): Promise<{
  pdfBuffer: Buffer
  deliveryNoteNumber: string
  filename: string
  order: any
}> {
  // 1. Fetch Order
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.companyId, companyId)))
    .limit(1)

  if (!order) {
    throw new Error(`Order '${orderId}' not found.`)
  }

  // 2. Fetch Company details
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!company) {
    throw new Error(`Company '${companyId}' not found.`)
  }

  // 3. Ensure delivery note number (reuse existing if present)
  let deliveryNoteNum = order.deliveryNoteNumber
  let customerNum = order.customerNumber

  if (!deliveryNoteNum) {
    const settings =
      company?.documentNumberSettings?.deliveryNote ||
      getDefaultSettings('deliveryNote', company || {})
    const nextVal = parseInt(settings.next || '1', 10)
    deliveryNoteNum = formatDocumentNumber(
      settings.format || '%jahr%%nummer%',
      nextVal,
      settings.padding || 5
    )

    // Increment sequence
    await db
      .update(companies)
      .set({
        documentNumberSettings: {
          ...company?.documentNumberSettings,
          deliveryNote: {
            ...settings,
            next: (nextVal + 1).toString(),
          },
        },
      })
      .where(eq(companies.id, companyId))

    await db
      .update(orders)
      .set({ deliveryNoteNumber: deliveryNoteNum, updatedAt: new Date() })
      .where(eq(orders.id, order.id))
  }

  if (!customerNum) {
    let existingCustomerNum = null
    if (order.buyerEmail) {
      const allOrdersForEmail = await db
        .select({ customerNumber: orders.customerNumber })
        .from(orders)
        .where(and(eq(orders.companyId, companyId), eq(orders.buyerEmail, order.buyerEmail)))

      const withNum = allOrdersForEmail.find((o) => o.customerNumber !== null)
      if (withNum) existingCustomerNum = withNum.customerNumber
    }

    if (existingCustomerNum) {
      customerNum = existingCustomerNum
    } else {
      customerNum = company.nextCustomerNumber || '1000'
      await db
        .update(companies)
        .set({
          nextCustomerNumber: String(Number(company.nextCustomerNumber || 1000) + 1),
        })
        .where(eq(companies.id, company.id))
    }

    await db
      .update(orders)
      .set({ customerNumber: customerNum, updatedAt: new Date() })
      .where(eq(orders.id, order.id))
  }

  // 4. Check cache
  const cacheKey = buildDeliveryNoteKey(companyId, order.id)
  try {
    const cached = await documentExists(cacheKey)
    if (cached) {
      const cachedPdf = await downloadDocument(cacheKey)
      return {
        pdfBuffer: cachedPdf,
        deliveryNoteNumber: deliveryNoteNum,
        filename: `Lieferschein_${order.marketplaceOrderId || order.id}.pdf`,
        order: { ...order, deliveryNoteNumber: deliveryNoteNum, customerNumber: customerNum },
      }
    }
  } catch (cacheErr) {
    console.warn(`[GrokConnector] Cache check failed for order ${order.id}:`, cacheErr)
  }

  // 5. Special Case: Marketplace delivery documents (About You, Mirakl)
  if (order.marketplace === 'aboutyou' || order.marketplace === 'limango') {
    const activeIntegrations = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.isActive, true)
        )
      )

    const integration = activeIntegrations.find(
      (i) =>
        i.type === order.marketplace ||
        (i.type === 'mirakl_custom' &&
          ((i.metadata as any)?.customName || '').toLowerCase() === order.marketplace.toLowerCase())
    )

    if (integration) {
      let adapter: any = null
      if (integration.type === 'aboutyou' && integration.apiKey) {
        const { AboutYouAdapter } = await import('@/adapters/marketplace/aboutyou')
        adapter = new AboutYouAdapter({
          apiKey: integration.apiKey,
          environment: (integration.environment as any) || 'production',
        })
      } else if (
        (integration.type.startsWith('mirakl_') || integration.type === 'mirakl_custom') &&
        integration.clientId
      ) {
        const { MiraklAdapter } = await import('@/adapters/marketplace/mirakl')
        const customName =
          integration.type === 'mirakl_custom'
            ? (integration.metadata as any)?.customName || 'mirakl_custom'
            : integration.type
        adapter = new MiraklAdapter({
          instance: customName.toLowerCase() as any,
          baseUrl: integration.environment!,
          clientId: integration.clientId,
          clientSecret: integration.clientSecret || '',
          apiKey: integration.apiKey || undefined,
          shopId: (integration.metadata as any)?.shopId || undefined,
        })
      }

      if (adapter && adapter.getDeliveryNote) {
        try {
          const marketplaceDoc = await adapter.getDeliveryNote(order.marketplaceOrderId)
          if (marketplaceDoc) {
            await uploadDocument(cacheKey, marketplaceDoc).catch(console.warn)
            return {
              pdfBuffer: marketplaceDoc,
              deliveryNoteNumber: deliveryNoteNum,
              filename: `${order.marketplace}_Lieferschein_${order.marketplaceOrderId}.pdf`,
              order: { ...order, deliveryNoteNumber: deliveryNoteNum, customerNumber: customerNum },
            }
          }
        } catch (adapterErr) {
          console.warn(`[GrokConnector] Marketplace delivery note fetch failed, falling back to local:`, adapterErr)
        }
      }
    }
  }

  // 6. Fetch items & render PDF locally
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(orderItems.position)

  const orderWithItems = {
    ...order,
    items,
    deliveryNoteNumber: deliveryNoteNum,
    customerNumber: customerNum,
  }

  const pdfBuffer = await renderToBuffer(
    React.createElement(DeliveryNoteDocument, {
      order: orderWithItems,
      company,
    }) as any
  )

  // Cache generated PDF
  await uploadDocument(cacheKey, pdfBuffer).catch((err) => {
    console.warn(`[GrokConnector] Failed to cache delivery note for ${order.id}:`, err)
  })

  return {
    pdfBuffer,
    deliveryNoteNumber: deliveryNoteNum,
    filename: `Lieferschein_${order.marketplaceOrderId || order.id}.pdf`,
    order: orderWithItems,
  }
}

export async function getMergedDeliveryNotesPdf(
  orderIds: string[],
  companyId: string
): Promise<{
  pdfBuffer: Buffer
  filename: string
  processedCount: number
  totalCount: number
}> {
  if (!orderIds || orderIds.length === 0) {
    throw new Error('orderIds list cannot be empty.')
  }

  const pdfBuffers: Buffer[] = []
  for (const id of orderIds) {
    try {
      const res = await getOrGenerateDeliveryNotePdf(id.trim(), companyId)
      pdfBuffers.push(res.pdfBuffer)
    } catch (err) {
      console.error(`[getMergedDeliveryNotesPdf] Failed for order ${id}:`, err)
    }
  }

  if (pdfBuffers.length === 0) {
    throw new Error('Could not generate any delivery note PDFs for the provided order IDs.')
  }

  const mergedPdf = await PDFDocument.create()
  for (const buf of pdfBuffers) {
    try {
      const srcPdf = await PDFDocument.load(buf)
      const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices())
      copiedPages.forEach((page) => mergedPdf.addPage(page))
    } catch (err) {
      console.error('[getMergedDeliveryNotesPdf] Error copying PDF pages:', err)
    }
  }

  const mergedBytes = await mergedPdf.save()
  const dateStr = getBerlinDateString()

  return {
    pdfBuffer: Buffer.from(mergedBytes),
    filename: `Lieferscheine_Sammel_Batch_${dateStr}.pdf`,
    processedCount: pdfBuffers.length,
    totalCount: orderIds.length,
  }
}

export async function getMergedShippingLabelsPdf(
  orderIds: string[],
  companyId: string
): Promise<{
  pdfBuffer: Buffer
  filename: string
  processedCount: number
  totalCount: number
}> {
  if (!orderIds || orderIds.length === 0) {
    throw new Error('orderIds list cannot be empty.')
  }

  const ordersData = await db
    .select()
    .from(orders)
    .where(and(inArray(orders.id, orderIds), eq(orders.companyId, companyId)))

  if (ordersData.length === 0) {
    throw new Error('No orders found matching the provided IDs.')
  }

  const pdfBuffers: Buffer[] = []

  for (const order of ordersData) {
    const urls = [order.labelUrl, order.returnLabelUrl].filter(Boolean) as string[]

    for (const url of urls) {
      try {
        if (url.startsWith('data:application/pdf;base64,')) {
          const base64 = url.split(',')[1]
          pdfBuffers.push(Buffer.from(base64, 'base64'))
        } else if (url.startsWith('http')) {
          const res = await fetch(url)
          if (res.ok) {
            const ab = await res.arrayBuffer()
            pdfBuffers.push(Buffer.from(ab))
          }
        } else {
          pdfBuffers.push(Buffer.from(url, 'base64'))
        }
      } catch (err) {
        console.error(`[getMergedShippingLabelsPdf] Error loading label for order ${order.id}:`, err)
      }
    }
  }

  if (pdfBuffers.length === 0) {
    throw new Error('No shipping labels available for the selected orders. Please generate shipping labels first.')
  }

  const mergedPdf = await PDFDocument.create()
  for (const buf of pdfBuffers) {
    try {
      const srcPdf = await PDFDocument.load(buf)
      const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices())
      copiedPages.forEach((page) => mergedPdf.addPage(page))
    } catch (err) {
      console.error('[getMergedShippingLabelsPdf] Error copying PDF pages:', err)
    }
  }

  const mergedBytes = await mergedPdf.save()
  const dateStr = getBerlinDateString()

  return {
    pdfBuffer: Buffer.from(mergedBytes),
    filename: `Versandlabels_Sammel_${dateStr}.pdf`,
    processedCount: pdfBuffers.length,
    totalCount: orderIds.length,
  }
}

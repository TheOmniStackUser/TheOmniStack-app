import { db } from '@/db/client'
import { invoices, invoiceItems } from '@/db/schema/invoices'
import { orders, orderItems } from '@/db/schema/orders'
import { companies } from '@/db/schema/companies'
import { eq, and, desc } from 'drizzle-orm'
import React from 'react'
import { uploadDocument, buildInvoiceKey } from '@/lib/storage'

function getCalendarWeek(d: Date): number {
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7)
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
}

export function formatDocumentNumber(
  formatTemplate: string,
  nextNum: number,
  padding: number,
  customerNumber?: string,
  supplierNumber?: string,
  date: Date = new Date()
): string {
  const year = date.getFullYear().toString()
  const yearShort = year.substring(2)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const week = getCalendarWeek(date).toString().padStart(2, '0')
  const numStr = nextNum.toString().padStart(padding || 1, '0')

  return formatTemplate
    .replace(/%jahr%/g, year)
    .replace(/%jahr_kurz%/g, yearShort)
    .replace(/%monat%/g, month)
    .replace(/%woche%/g, week)
    .replace(/%tag%/g, day)
    .replace(/%kunde%/g, customerNumber || '')
    .replace(/%lieferant%/g, supplierNumber || '')
    .replace(/%nummer%/g, numStr)
}

export function getDefaultSettings(
  settingsKey: 'invoice' | 'quote' | 'creditNote' | 'deliveryNote' | 'purchaseOrder',
  company: { nextInvoiceNumber?: string; nextDeliveryNoteNumber?: string }
) {
  const defaults = {
    invoice: {
      auto: true,
      next: company.nextInvoiceNumber || '1',
      format: '%jahr%%nummer%',
      padding: 5,
      perContact: false
    },
    quote: {
      auto: true,
      next: '10001',
      format: '%nummer%',
      padding: 5,
      perContact: false
    },
    creditNote: {
      auto: true,
      next: '10001',
      format: '%nummer%',
      padding: 5,
      perContact: false
    },
    deliveryNote: {
      auto: true,
      next: company.nextDeliveryNoteNumber || '1',
      format: '%nummer%',
      padding: 5,
      perContact: false
    },
    purchaseOrder: {
      auto: true,
      next: '10001',
      format: '%nummer%',
      padding: 5,
      perContact: false
    }
  }
  return defaults[settingsKey]
}

/**
 * Automatically creates an invoice for a given order if one doesn't exist yet.
 * Returns the created invoice ID and the storage key of the generated PDF.
 * 
 * DESIGN: We perform PDF generation and upload BEFORE the DB transaction 
 * to avoid holding locks during expensive I/O and CPU tasks.
 */
export async function createInvoiceForOrder(orderId: string, companyId: string, options: { 
  txContext?: any, 
  isCreditNote?: boolean, 
  customText?: string, 
  taxOption?: string, 
  dueDate?: Date, 
  status?: 'issued' | 'draft', 
  draftName?: string,
  shippingCountry?: string,
  destinationCountry?: string,
  taxCountry?: string,
  orderNumber?: string,
  buyerReference?: string,
  externalId?: string,
  orderDate?: Date,
  documentType?: 'invoice' | 'quote' | 'delivery_note'
} = {}) {
  const { 
    txContext, 
    isCreditNote = false, 
    customText, 
    taxOption, 
    dueDate: customDueDate, 
    status = 'issued', 
    draftName,
    shippingCountry,
    destinationCountry,
    taxCountry,
    orderNumber: customOrderNumber,
    buyerReference,
    externalId,
    orderDate: customOrderDate,
    documentType = 'invoice'
  } = options
  // 1. Fetch data needed for PDF (outside transaction for better performance)
  const dbClient = txContext || db
  
  const order = await dbClient.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.companyId, companyId)),
    with: { items: true }
  })

  if (!order) throw new Error('Order not found')
  if (order.invoiceId && documentType === 'invoice') return { skipped: true, reason: 'Invoice already exists' }

  const [company] = await dbClient.select().from(companies).where(eq(companies.id, companyId)).limit(1)
  if (!company) throw new Error('Company not found')

  // 2. Generate Invoice Number
  let settingsKey: 'invoice' | 'quote' | 'creditNote' | 'deliveryNote' | 'purchaseOrder' = 'invoice'
  if (isCreditNote) {
    settingsKey = 'creditNote'
  } else if (documentType === 'quote') {
    settingsKey = 'quote'
  } else if (documentType === 'delivery_note') {
    settingsKey = 'deliveryNote'
  }

  const dbSettings = company.documentNumberSettings as any
  const config = dbSettings?.[settingsKey] || getDefaultSettings(settingsKey, company)

  let invoiceNumber = ''
  if (config && config.auto) {
    const nextNum = parseInt(config.next, 10) || 1
    const padding = config.padding || 5
    const customerNumber = order.customerNumber || ''
    
    invoiceNumber = formatDocumentNumber(
      config.format,
      nextNum,
      padding,
      customerNumber,
      ''
    )
  } else if (config && !config.auto) {
    invoiceNumber = customOrderNumber || `MAN-${Date.now()}`
  } else {
    // Fallback to legacy sequence generation
    const [lastInvoice] = await dbClient
      .select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), eq(invoices.documentType, documentType)))
      .orderBy(desc(invoices.invoiceNumber))
      .limit(1)

    let nextNumber = 1
    if (lastInvoice) {
      const match = lastInvoice.invoiceNumber.match(/(\d+)$/)
      if (match) nextNumber = parseInt(match[1]) + 1
    }
    const prefix = documentType === 'quote' ? 'ANG' : (documentType === 'delivery_note' ? 'LS' : 'INV')
    invoiceNumber = `${prefix}-${new Date().getFullYear()}-${nextNumber.toString().padStart(5, '0')}`
  }

  // 3. Generate PDF Buffer (CPU intensive)
  // Dynamic imports required to avoid ESM/CJS module conflict
  const { renderToBuffer } = await import('@react-pdf/renderer')

  const { paymentMethod } = extractPaymentInfo(order)
  const metadata = (order.rawPayload as any)?.manualMetadata || {}

  let pdfBuffer;
  if (documentType === 'delivery_note') {
    const { DeliveryNoteDocument } = await import('@/components/pdf/delivery-note')
    const mappedOrder = {
      shippingName: order.shippingName || order.buyerName || 'Kunde',
      shippingStreet: order.shippingStreet || '',
      shippingZip: order.shippingZip || '',
      shippingCity: order.shippingCity || '',
      shippingCountry: order.shippingCountry || 'DE',
      customerNumber: order.customerNumber || '–',
      deliveryNoteNumber: invoiceNumber,
      marketplaceOrderId: order.marketplaceOrderId,
      marketplacePurchaseDate: order.marketplacePurchaseDate || new Date(),
      items: order.items.map((i: typeof orderItems.$inferSelect) => ({
        quantity: parseInt(i.quantity),
        sku: i.sku,
        title: i.title || 'Produkt',
      }))
    }
    pdfBuffer = await renderToBuffer(
      React.createElement(DeliveryNoteDocument, {
        order: mappedOrder,
        company: company,
      }) as any
    )
  } else {
    const { InvoiceDocument } = await import('@/components/pdf/invoice')
    pdfBuffer = await renderToBuffer(
      React.createElement(InvoiceDocument, {
        invoiceNumber,
        date: new Date(),
        dueDate: customDueDate || new Date(),
        orderNumber: customOrderNumber || metadata.orderNumber || (order.marketplace === 'manual' ? undefined : order.marketplaceOrderId),
        orderDate: customOrderDate || order.marketplacePurchaseDate || undefined,
        buyerReference: buyerReference || metadata.buyerReference,
        externalId: externalId || metadata.externalId,
        customerNumber: order.customerNumber || '–',
        customText: customText || metadata.customText,
        taxOption: taxOption || metadata.taxOption,
        company: {
          name: company.legalName || company.name,
          street: company.street || undefined,
          zip: company.zip || undefined,
          city: company.city || undefined,
          country: company.country,
          email: company.email || undefined,
          phone: company.phone || undefined,
          website: company.website || undefined,
          vatId: company.vatId || undefined,
          taxId: company.taxId || undefined,
          bankName: company.bankName || undefined,
          bankIban: company.iban || undefined,
          bankBic: company.bic || undefined,
          logoUrl: company.logoUrl || undefined,
          paymentRecipient: company.paymentRecipient || undefined,
          management: company.management || undefined,
          registrationCourt: company.registrationCourt || undefined,
          internationalLanguage: company.internationalLanguage || undefined,
        },
        recipient: {
          name: order.shippingName || order.buyerName || 'Kunde',
          street: order.shippingStreet || '',
          zip: order.shippingZip || '',
          city: order.shippingCity || '',
          country: order.shippingCountry || 'DE',
        },
        items: order.items.map((i: typeof orderItems.$inferSelect) => ({
          sku: i.sku,
          title: i.title || 'Produkt',
          quantity: parseInt(i.quantity),
          unitPrice: parseFloat(i.unitPrice),
          taxRate: parseFloat(i.taxRate),
        })),
        currency: order.currency,
        paymentMethod,
        isCreditNote,
        documentType,
      }) as any
    )
  }

  // 4. Upload to Storage (I/O intensive)
  const storageKey = buildInvoiceKey(companyId, invoiceNumber)
  await uploadDocument(storageKey, pdfBuffer)

  // 5. Save to Database (Fast Transaction)
  const runDbAction = async (tx: any) => {
    // Double check inside transaction for invoice duplicates
    if (documentType === 'invoice') {
      const currentOrder = await tx.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.companyId, companyId)),
        columns: { invoiceId: true }
      })
      if (currentOrder?.invoiceId) return { skipped: true, reason: 'Invoice already exists' }
    }

    // Increment document next number if auto-numbering is enabled
    const [dbCompany] = await tx
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .for('update')

    if (dbCompany) {
      const currentSettings = dbCompany.documentNumberSettings as any || {}
      const config = currentSettings[settingsKey] || getDefaultSettings(settingsKey, dbCompany)
      if (config && config.auto) {
        const nextNum = parseInt(config.next, 10) || 1
        const updatedSettings = {
          ...currentSettings,
          [settingsKey]: {
            ...config,
            next: (nextNum + 1).toString()
          }
        }
        
        const updateData: any = {
          documentNumberSettings: updatedSettings,
          updatedAt: new Date()
        }
        
        if (settingsKey === 'invoice') {
          updateData.nextInvoiceNumber = (nextNum + 1).toString()
        } else if (settingsKey === 'deliveryNote') {
          updateData.nextDeliveryNoteNumber = (nextNum + 1).toString()
        }

        await tx.update(companies)
          .set(updateData)
          .where(eq(companies.id, companyId))
      }
    }

    const calculatedSubtotal = order.items.reduce((sum: number, i: typeof orderItems.$inferSelect) => sum + (parseFloat(i.unitPrice) * parseFloat(i.quantity)), 0)
    const calculatedTax = order.items.reduce((sum: number, i: typeof orderItems.$inferSelect) => sum + (parseFloat(i.unitPrice) * parseFloat(i.quantity) * parseFloat(i.taxRate)), 0)
    const calculatedTotal = calculatedSubtotal + calculatedTax

    const [newInvoice] = await tx
      .insert(invoices)
      .values({
        companyId,
        invoiceNumber,
        status,
        draftName,
        documentType,
        recipientName: order.shippingName || order.buyerName || 'Kunde',
        recipientStreet: order.shippingStreet || '',
        recipientZip: order.shippingZip || '',
        recipientCity: order.shippingCity || '',
        recipientCountry: order.shippingCountry || 'DE',
        recipientEmail: order.buyerEmail || null,
        currency: order.currency || 'EUR',
        subtotalAmount: calculatedSubtotal.toFixed(2),
        taxAmount: calculatedTax.toFixed(2),
        totalAmount: calculatedTotal.toFixed(2),
        taxRate: (calculatedTax / calculatedSubtotal || 0).toFixed(4),
        isCreditNote,
        dueAt: customDueDate || new Date(),
        pdfStorageKey: storageKey,
        pdfGeneratedAt: new Date(),
        issuedAt: status === 'issued' ? new Date() : null,
      })
      .returning({ id: invoices.id })

    // Create Items
    if (order.items.length > 0) {
      await tx.insert(invoiceItems).values(
        order.items.map((item: typeof orderItems.$inferSelect, index: number) => ({
          invoiceId: newInvoice.id,
          companyId,
          position: (index + 1).toString(),
          sku: item.sku,
          description: item.title || 'Produkt',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          lineTotal: (parseFloat(item.unitPrice) * parseFloat(item.quantity)).toFixed(2),
        }))
      )
    }

    // Link to Order if it is a standard invoice and update status to invoiced if it was pending
    if (documentType === 'invoice') {
      const newStatus = order.status === 'pending' ? 'invoiced' : order.status
      await tx.update(orders)
        .set({ 
          invoiceId: newInvoice.id,
          status: newStatus
        })
        .where(eq(orders.id, orderId))
    }

    return { 
      invoiceId: newInvoice.id, 
      invoiceNumber, 
      storageKey, 
      pdfBuffer 
    }
  }

  if (txContext) {
    return await runDbAction(txContext)
  } else {
    return await db.transaction(async (tx) => await runDbAction(tx))
  }
}

/**
 * Extracts payment method and status from the raw marketplace payload.
 */
function extractPaymentInfo(order: any) {
  const marketplace = order.marketplace
  const raw = order.rawPayload || {}
  
  let paymentMethod = 'Marketplace'
  let isPaid = true // Default for marketplace orders that are ready for invoicing
  
  try {
    if (marketplace === 'otto') {
      paymentMethod = 'Otto.de'
    } else if (marketplace === 'amazon') {
      paymentMethod = 'Amazon'
    } else if (marketplace.startsWith('mirakl_')) {
      // Mirakl payload often has payment_workflow or similar
      paymentMethod = raw.payment_type || raw.payment_workflow || 'Marketplace'
    } else if (marketplace === 'shopify') {
      paymentMethod = raw.gateway || 'Shopify'
      isPaid = raw.financial_status === 'paid'
    } else if (marketplace === 'manual') {
      paymentMethod = 'Vorkasse / Überweisung'
      isPaid = false // Manual orders might not be paid yet
    }
  } catch (err) {
    console.error('[InvoiceService] Error extracting payment info:', err)
  }
  
  return { paymentMethod, isPaid }
}

/**
 * Regenerates the PDF for an existing invoice.
 * Useful when the template or company details have changed.
 */
export async function regenerateInvoicePdf(invoiceId: string, companyId: string) {
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)),
    with: {
      items: true,
      originalInvoice: true,
    }
  })

  if (!invoice) throw new Error('Invoice not found')

  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
  if (!company) throw new Error('Company not found')

  // Find associated order to get order number and payment info
  const order = await db.query.orders.findFirst({
    where: eq(orders.invoiceId, invoiceId)
  })

  // Dynamic imports for PDF generation
  const { renderToBuffer } = await import('@react-pdf/renderer')
  const { InvoiceDocument } = await import('@/components/pdf/invoice')

  const paymentInfo = order ? extractPaymentInfo(order) : { paymentMethod: 'Marketplace', isPaid: true }
  const metadata = (order?.rawPayload as any)?.manualMetadata || {}

  let pdfBuffer;
  if (invoice.documentType === 'delivery_note') {
    const { DeliveryNoteDocument } = await import('@/components/pdf/delivery-note')
    const mappedOrder = {
      shippingName: invoice.recipientName || 'Kunde',
      shippingStreet: invoice.recipientStreet || '',
      shippingZip: invoice.recipientZip || '',
      shippingCity: invoice.recipientCity || '',
      shippingCountry: invoice.recipientCountry || 'DE',
      customerNumber: order?.customerNumber || '–',
      deliveryNoteNumber: invoice.invoiceNumber,
      marketplaceOrderId: order?.marketplaceOrderId || '–',
      marketplacePurchaseDate: order?.marketplacePurchaseDate || invoice.createdAt,
      items: invoice.items.map((i: any) => ({
        quantity: parseInt(i.quantity),
        sku: i.sku,
        title: i.description || 'Produkt',
      }))
    }
    pdfBuffer = await renderToBuffer(
      React.createElement(DeliveryNoteDocument, {
        order: mappedOrder,
        company: company,
      }) as any
    )
  } else {
    const { InvoiceDocument } = await import('@/components/pdf/invoice')
    pdfBuffer = await renderToBuffer(
      React.createElement(InvoiceDocument, {
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.createdAt,
        dueDate: invoice.dueAt || invoice.createdAt,
        orderNumber: (order?.marketplace === 'manual' ? (metadata.orderNumber || undefined) : order?.marketplaceOrderId) || undefined,
        orderDate: order?.marketplacePurchaseDate || undefined,
        customerNumber: order?.customerNumber || '–',
        customText: metadata.customText || undefined,
        taxOption: metadata.taxOption || undefined,
        buyerReference: metadata.buyerReference || undefined,
        externalId: metadata.externalId || undefined,
        company: {
          name: company.legalName || company.name,
          street: company.street || undefined,
          zip: company.zip || undefined,
          city: company.city || undefined,
          country: company.country,
          email: company.email || undefined,
          phone: company.phone || undefined,
          website: company.website || undefined,
          vatId: company.vatId || undefined,
          taxId: company.taxId || undefined,
          bankName: company.bankName || undefined,
          bankIban: company.iban || undefined,
          bankBic: company.bic || undefined,
          logoUrl: company.logoUrl || undefined,
          paymentRecipient: company.paymentRecipient || undefined,
          management: company.management || undefined,
          registrationCourt: company.registrationCourt || undefined,
          internationalLanguage: company.internationalLanguage || undefined,
        },
        recipient: {
          name: invoice.recipientName || 'Kunde',
          street: invoice.recipientStreet || '',
          zip: invoice.recipientZip || '',
          city: invoice.recipientCity || '',
          country: invoice.recipientCountry || 'DE',
        },
        items: invoice.items.map((i: any) => ({
          sku: i.sku,
          title: i.description,
          quantity: parseInt(i.quantity),
          unitPrice: parseFloat(i.unitPrice),
          taxRate: parseFloat(i.taxRate),
        })),
        currency: invoice.currency,
        paymentMethod: paymentInfo.paymentMethod,
        isCreditNote: invoice.isCreditNote || false,
        documentType: invoice.documentType || 'invoice',
        cancelsInvoiceNumber: invoice.originalInvoice?.invoiceNumber || undefined,
        cancelsInvoiceDate: invoice.originalInvoice?.createdAt || undefined,
      }) as any
    )
  }

  const storageKey = invoice.pdfStorageKey || buildInvoiceKey(companyId, invoice.invoiceNumber)
  await uploadDocument(storageKey, pdfBuffer)

  // Update generated timestamp
  await db.update(invoices)
    .set({ pdfGeneratedAt: new Date(), pdfStorageKey: storageKey })
    .where(eq(invoices.id, invoiceId))

  return { storageKey }
}

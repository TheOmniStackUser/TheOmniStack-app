'use server'

import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { requireAuth } from '@/lib/session'
import { eq, and, desc, ne } from 'drizzle-orm'
import { createInvoiceForOrder } from '@/lib/invoice-service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { companies } from '@/db/schema/companies'
import { invoices, invoiceItems, invoiceLogs } from '@/db/schema/invoices'
import { customers } from '@/db/schema/customers'
import { sql } from 'drizzle-orm'
import React from 'react'
import { saveCustomerAction } from './customers'

export async function createManualInvoiceAction(data: {
  customer: {
    id?: string
    name: string
    street: string
    zip: string
    city: string
    country: string
    email?: string
    vatId?: string
    customerNumber?: string
  }
  items: {
    title: string
    quantity: number
    unitPrice: number
    taxRate: number
    sku?: string
  }[]
  currency: string
  isCreditNote?: boolean
  taxOption?: string
  dueDate?: Date
  status?: 'issued' | 'draft'
  draftName?: string
  shippingCountry?: string
  destinationCountry?: string
  taxCountry?: string
  orderNumber?: string
  orderDate?: Date
  buyerReference?: string
  externalId?: string
  customText?: string
  skontoRate?: number
  skontoDays?: number
  discountRate?: number
  ossEnabled?: boolean
  dueDateDays?: number
  createOrder?: boolean
  currentDraftId?: string | null
  vatCheckStatus?: { status: string, lastChecked?: Date }
  documentType?: 'invoice' | 'quote' | 'delivery_note'
  cancelsInvoiceId?: string
}) {
  try {
    const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  // 0. Save/Update customer record
  await saveCustomerAction({
    name: data.customer.name,
    email: data.customer.email,
    street: data.customer.street,
    zip: data.customer.zip,
    city: data.customer.city,
    country: data.customer.country,
    vatId: data.customer.vatId
  })

  // 1. Create a manual order
  const subtotal = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
  const tax = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice * (item.taxRate / 100)), 0)
  const total = subtotal + tax

  const order = await db.transaction(async (tx) => {
    // 1. Remove existing draft if updating
    if (data.currentDraftId) {
      await tx.delete(invoices).where(and(eq(invoices.id, data.currentDraftId), eq(invoices.companyId, companyId)))
      await tx.delete(orders).where(and(eq(orders.invoiceId, data.currentDraftId), eq(orders.companyId, companyId)))
    }

    // 2. Also remove by name if it's a draft and name is different but already exists
    if (data.status === 'draft' && data.draftName?.trim()) {
      const existingDrafts = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(
          eq(invoices.companyId, companyId),
          eq(invoices.status, 'draft'),
          eq(invoices.draftName, data.draftName.trim()),
          data.currentDraftId ? ne(invoices.id, data.currentDraftId) : undefined
        ))

      for (const d of existingDrafts) {
        await tx.delete(invoices).where(eq(invoices.id, d.id))
        await tx.delete(orders).where(eq(orders.invoiceId, d.id))
      }
    }

    const [newOrder] = await tx
      .insert(orders)
      .values({
        companyId,
        marketplace: 'manual',
        marketplaceOrderId: `MAN-${Date.now()}`,
        marketplacePurchaseDate: data.orderDate || new Date(),
        status: data.status === 'draft' ? 'draft' : 'invoiced',
        buyerName: data.customer.name,
        buyerEmail: data.customer.email,
        shippingName: data.customer.name,
        shippingStreet: data.customer.street,
        shippingZip: data.customer.zip,
        shippingCity: data.customer.city,
        shippingCountry: data.customer.country,
        currency: data.currency,
        subtotalAmount: subtotal.toFixed(2),
        taxAmount: tax.toFixed(2),
        totalAmount: total.toFixed(2),
        isArchived: data.createOrder === false, // Hide from list if false
        rawPayload: {
          manualMetadata: {
            draftName: data.draftName,
            customText: data.customText,
            taxOption: data.taxOption,
            shippingCountry: data.shippingCountry,
            destinationCountry: data.destinationCountry,
            taxCountry: data.taxCountry,
            orderNumber: data.orderNumber,
            orderDate: data.orderDate,
            buyerReference: data.buyerReference,
            externalId: data.externalId,
            skontoRate: data.skontoRate,
            skontoDays: data.skontoDays,
            discountRate: data.discountRate,
            ossEnabled: data.ossEnabled,
            dueDateDays: data.dueDateDays,
            createOrder: data.createOrder
          }
        }
      })
      .returning({ id: orders.id })

    await tx.insert(orderItems).values(
      data.items.map(item => ({
        orderId: newOrder.id,
        companyId,
        title: item.title,
        sku: item.sku,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toFixed(2),
        taxRate: (item.taxRate / 100).toString(),
      }))
    )

    // 1b. Upsert Customer and get customer number
    let finalCustomerNumber = data.customer.customerNumber || null
    if (data.customer.name?.trim()) {
      const custResult = await saveCustomerAction({
        id: data.customer.id,
        name: data.customer.name,
        email: data.customer.email,
        street: data.customer.street,
        zip: data.customer.zip,
        city: data.customer.city,
        country: data.customer.country,
        vatId: data.customer.vatId,
        customerNumber: data.customer.customerNumber,
        vatCheckStatus: data.vatCheckStatus
      })
      if (custResult.success) {
        finalCustomerNumber = custResult.customerNumber
        // Update the order with the customer number
        await tx.update(orders)
          .set({ customerNumber: finalCustomerNumber })
          .where(eq(orders.id, newOrder.id))
      }
    }

    return [newOrder]
  })

  // 2. Generate the invoice/quote/delivery_note
  const orderData = order[0]
  const invoiceResult = await createInvoiceForOrder(orderData.id, companyId, { 
    isCreditNote: data.isCreditNote,
    cancelsInvoiceId: data.cancelsInvoiceId,
    customText: data.customText,
    taxOption: data.taxOption,
    dueDate: data.dueDate,
    status: data.status || 'issued',
    draftName: data.draftName,
    shippingCountry: data.shippingCountry,
    destinationCountry: data.destinationCountry,
    taxCountry: data.taxCountry,
    orderNumber: data.orderNumber,
    orderDate: data.orderDate,
    buyerReference: data.buyerReference,
    externalId: data.externalId,
    documentType: data.documentType || 'invoice'
  })

  if (invoiceResult && (invoiceResult as any).invoiceId) {
    await db.insert(invoiceLogs).values({
      invoiceId: (invoiceResult as any).invoiceId,
      companyId,
      userId: auth.userId,
      action: 'created',
      note: data.documentType === 'quote' 
        ? 'Angebot manuell erstellt.' 
        : (data.documentType === 'delivery_note' 
          ? 'Lieferschein manuell erstellt.' 
          : (data.isCreditNote 
            ? 'Gutschrift manuell erstellt.' 
            : 'Rechnung manuell erstellt.'))
    })
  }

  const redirectTarget = data.documentType === 'quote' ? '/quotes' : '/invoices'
  if (data.status !== 'draft') {
    redirect(redirectTarget)
  }
  
  return { success: true, draftId: (invoiceResult as any).invoiceId }
  } catch (error: any) {
    if (error.message === 'NEXT_REDIRECT' || error.digest?.includes('NEXT_REDIRECT')) {
      throw error
    }
    console.error('[CreateManualInvoice] Error:', error)
    return { error: error.message || 'Unbekannter Fehler' }
  }
}

// ─── Quote Actions ─────────────────────────────────────────────────────────────

export async function getQuotesAction() {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const allQuotes = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      recipientName: invoices.recipientName,
      recipientCountry: invoices.recipientCountry,
      totalAmount: invoices.totalAmount,
      currency: invoices.currency,
      createdAt: invoices.createdAt,
      pdfStorageKey: invoices.pdfStorageKey,
      status: invoices.status,
      draftName: invoices.draftName,
    })
    .from(invoices)
    .where(and(
      eq(invoices.companyId, companyId),
      eq(invoices.documentType, 'quote')
    ))
    .orderBy(desc(invoices.createdAt))

  return allQuotes
}

export async function getQuoteDetailsAction(quoteId: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const quote = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, quoteId),
      eq(invoices.companyId, companyId),
      eq(invoices.documentType, 'quote')
    ),
    with: { items: true }
  })

  if (!quote) throw new Error('Angebot nicht gefunden')

  // Fetch the linked order to get manual metadata from rawPayload
  const linkedOrder = await db.query.orders.findFirst({
    where: eq(orders.invoiceId, quoteId)
  })

  const metadata = (linkedOrder?.rawPayload as any)?.manualMetadata || {}

  return {
    invoice: {
      ...quote,
      customText: metadata.customText,
      taxOption: metadata.taxOption,
      shippingCountry: metadata.shippingCountry,
      destinationCountry: metadata.destinationCountry,
      taxCountry: metadata.taxCountry,
      orderNumber: metadata.orderNumber,
      orderDate: metadata.orderDate ? new Date(metadata.orderDate).toISOString().split('T')[0] : '',
      buyerReference: metadata.buyerReference,
      externalId: metadata.externalId,
      skontoRate: metadata.skontoRate,
      skontoDays: metadata.skontoDays,
      discountRate: metadata.discountRate,
      ossEnabled: metadata.ossEnabled,
      dueDateDays: metadata.dueDateDays,
    },
    items: quote.items,
    linkedOrder
  }
}

/**
 * Converts an existing quote into a new invoice or delivery note.
 * The original quote remains unchanged in the database.
 */
export async function convertQuoteAction(quoteId: string, targetType: 'invoice' | 'delivery_note') {
  try {
    const auth = await requireAuth()
    const companyId = auth.activeCompanyId

    // 1. Fetch the quote
    const quote = await db.query.invoices.findFirst({
      where: and(
        eq(invoices.id, quoteId),
        eq(invoices.companyId, companyId),
        eq(invoices.documentType, 'quote')
      ),
      with: { items: true }
    })
    if (!quote) throw new Error('Angebot nicht gefunden')

    // 2. Fetch the linked order (for data source)
    const linkedOrder = await db.query.orders.findFirst({
      where: eq(orders.invoiceId, quoteId),
      with: { items: true }
    })
    if (!linkedOrder) throw new Error('Verknüpfte Bestellung nicht gefunden')

    const metadata = (linkedOrder?.rawPayload as any)?.manualMetadata || {}

    // 3. Create a new order clone for the new document
    const subtotal = parseFloat(quote.subtotalAmount || '0')
    const tax = parseFloat(quote.taxAmount || '0')
    const total = parseFloat(quote.totalAmount || '0')

    const [newOrder] = await db
      .insert(orders)
      .values({
        companyId,
        marketplace: 'manual',
        marketplaceOrderId: `MAN-${Date.now()}`,
        marketplacePurchaseDate: new Date(),
        status: 'invoiced',
        buyerName: quote.recipientName || '',
        buyerEmail: quote.recipientEmail || undefined,
        shippingName: quote.recipientName || '',
        shippingStreet: quote.recipientStreet || '',
        shippingZip: quote.recipientZip || '',
        shippingCity: quote.recipientCity || '',
        shippingCountry: quote.recipientCountry || 'DE',
        currency: quote.currency || 'EUR',
        subtotalAmount: subtotal.toFixed(2),
        taxAmount: tax.toFixed(2),
        totalAmount: total.toFixed(2),
        isArchived: true, // hide from orders list
        customerNumber: linkedOrder.customerNumber,
        rawPayload: linkedOrder.rawPayload,
      })
      .returning({ id: orders.id })

    // Clone order items
    if (linkedOrder.items && linkedOrder.items.length > 0) {
      await db.insert(orderItems).values(
        (linkedOrder.items as any[]).map((item: any) => ({
          orderId: newOrder.id,
          companyId,
          title: item.title,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
        }))
      )
    }

    // 4. Generate the new document
    const { createInvoiceForOrder } = await import('@/lib/invoice-service')
    const result = await createInvoiceForOrder(newOrder.id, companyId, {
      documentType: targetType,
      status: 'issued',
      customText: metadata.customText,
      taxOption: metadata.taxOption,
      shippingCountry: metadata.shippingCountry,
      destinationCountry: metadata.destinationCountry,
      taxCountry: metadata.taxCountry,
      orderNumber: metadata.orderNumber,
      buyerReference: metadata.buyerReference,
      externalId: metadata.externalId,
    })

    revalidatePath('/quotes')
    revalidatePath('/invoices')

    const redirectTarget = targetType === 'invoice' ? '/invoices' : '/invoices'
    redirect(redirectTarget)
  } catch (error: any) {
    if (error.message === 'NEXT_REDIRECT' || error.digest?.includes('NEXT_REDIRECT')) {
      throw error
    }
    console.error('[ConvertQuote] Error:', error)
    return { error: error.message || 'Fehler bei der Konvertierung' }
  }
}

export async function deleteQuoteAction(quoteId: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  await db.transaction(async (tx) => {
    const [quote] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(
        eq(invoices.id, quoteId),
        eq(invoices.companyId, companyId),
        eq(invoices.documentType, 'quote')
      ))
      .limit(1)

    if (!quote) return

    // Delete order_items for linked orders
    const linkedOrders = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.invoiceId, quoteId))
    
    for (const o of linkedOrders) {
      await tx.delete(orderItems).where(eq(orderItems.orderId, o.id))
    }

    // Delete linked orders
    await tx.delete(orders).where(eq(orders.invoiceId, quoteId))

    // Delete invoice items
    await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, quoteId))

    // Delete the invoice/quote record
    await tx.delete(invoices).where(and(eq(invoices.id, quoteId), eq(invoices.companyId, companyId)))
  })

  revalidatePath('/quotes')
}


export async function getDraftsAction() {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const allDrafts = await db.query.invoices.findMany({
    where: and(
      eq(invoices.companyId, companyId),
      eq(invoices.status, 'draft'),
      eq(invoices.documentType, 'invoice')
    ),
    orderBy: desc(invoices.createdAt),
  })

  const seenNames = new Set<string>()
  return allDrafts.filter(d => {
    const nameKey = d.draftName?.trim() || '___UNNAMED___'
    if (seenNames.has(nameKey)) return false
    seenNames.add(nameKey)
    return true
  })
}

export async function getDraftDetailsAction(draftId: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const [invoice] = await db.query.invoices.findMany({
    where: and(
      eq(invoices.id, draftId),
      eq(invoices.companyId, companyId)
    ),
    with: { items: true },
    limit: 1
  })

  if (!invoice) throw new Error('Draft not found')

  // Fetch the linked order to get manual metadata from rawPayload
  const [linkedOrder] = await db
    .select()
    .from(orders)
    .where(eq(orders.invoiceId, draftId))
    .limit(1)

  const metadata = (linkedOrder?.rawPayload as any)?.manualMetadata || {}

  return {
    invoice: {
      ...invoice,
      draftName: invoice.draftName || metadata.draftName,
      customText: metadata.customText,
      taxOption: metadata.taxOption,
      shippingCountry: metadata.shippingCountry,
      destinationCountry: metadata.destinationCountry,
      taxCountry: metadata.taxCountry,
      orderNumber: metadata.orderNumber,
      orderDate: metadata.orderDate ? new Date(metadata.orderDate).toISOString().split('T')[0] : '',
      buyerReference: metadata.buyerReference,
      externalId: metadata.externalId,
      skontoRate: metadata.skontoRate,
      skontoDays: metadata.skontoDays,
      discountRate: metadata.discountRate,
      ossEnabled: metadata.ossEnabled,
      dueDateDays: metadata.dueDateDays,
      createOrder: metadata.createOrder ?? false
    },
    items: invoice.items
  }
}

export async function deleteDraftAction(draftId: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  await db.transaction(async (tx) => {
    const [invoice] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(
        eq(invoices.id, draftId),
        eq(invoices.companyId, companyId),
        eq(invoices.status, 'draft')
      ))
      .limit(1)

    if (!invoice) return

    // 1. Delete order_items for all orders linked to this invoice
    const associatedOrders = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.invoiceId, draftId))
    
    for (const o of associatedOrders) {
      await tx.delete(orderItems).where(eq(orderItems.orderId, o.id))
    }

    // 2. Delete orders linked to this invoice
    await tx.delete(orders).where(eq(orders.invoiceId, draftId))

    // 3. Delete invoice items
    await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, draftId))

    // 4. Finally delete the invoice
    await tx.delete(invoices).where(and(eq(invoices.id, draftId), eq(invoices.companyId, companyId)))
  })

  revalidatePath('/invoices')
}

export async function previewInvoiceAction(data: {
  customer: {
    name: string
    street: string
    zip: string
    city: string
    country: string
    email?: string
    vatId?: string
    customerNumber?: string
  }
  items: {
    title: string
    quantity: number
    unitPrice: number
    taxRate: number
    sku?: string
  }[]
  currency: string
  isCreditNote?: boolean
  customText?: string
  taxOption?: string
  dueDate?: Date
  orderNumber?: string
  orderDate?: Date
  buyerReference?: string
  externalId?: string
  documentType?: 'invoice' | 'quote' | 'delivery_note'
}) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
  if (!company) throw new Error('Company not found')

  const { renderToBuffer } = await import('@react-pdf/renderer')
  const { InvoiceDocument } = await import('@/components/pdf/invoice')

  const pdfBuffer = await renderToBuffer(
    React.createElement(InvoiceDocument, {
      invoiceNumber: 'VORSCHAU-001',
      date: new Date(),
      dueDate: data.dueDate || new Date(),
      orderNumber: data.orderNumber || 'PREVIEW',
      orderDate: data.orderDate,
      buyerReference: data.buyerReference,
      externalId: data.externalId,
      customerNumber: data.customer.customerNumber || 'P-123',
      customText: data.customText,
      taxOption: data.taxOption,
      documentType: data.documentType || 'invoice',
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
        footerText: data.documentType === 'quote' ? (company.offerFooter || undefined) : (company.invoiceFooter || undefined),
        footerTextEn: data.documentType === 'quote' ? (company.offerFooterEn || undefined) : (company.invoiceFooterEn || undefined),
      },
      recipient: {
        name: data.customer.name || 'Empfänger Name',
        street: data.customer.street || 'Straße 1',
        zip: data.customer.zip || '12345',
        city: data.customer.city || 'Stadt',
        country: data.customer.country || 'DE',
      },
      items: data.items.map(i => ({
        sku: i.sku,
        title: i.title || 'Produkt',
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxRate: i.taxRate / 100,
      })),
      currency: data.currency,
      isCreditNote: data.isCreditNote,
      isPaid: false,
      paymentMethod: 'Vorschau',
    }) as any
  )

  return { 
    base64: pdfBuffer.toString('base64'),
    contentType: 'application/pdf'
  }
}

export async function editManualInvoiceAction(data: {
  invoiceId: string
  internalNote: string
  customer: {
    name: string
    street: string
    zip: string
    city: string
    country: string
    email?: string
    vatId?: string
    customerNumber?: string
  }
  items: {
    title: string
    quantity: number
    unitPrice: number
    taxRate: number
    sku?: string
  }[]
  currency: string
  isCreditNote?: boolean
  taxOption?: string
  dueDate?: Date
  shippingCountry?: string
  destinationCountry?: string
  taxCountry?: string
  orderNumber?: string
  orderDate?: Date
  buyerReference?: string
  externalId?: string
  customText?: string
  skontoRate?: number
  skontoDays?: number
  discountRate?: number
  ossEnabled?: boolean
  dueDateDays?: number
  vatCheckStatus?: { status: string, lastChecked?: Date }
}) {
  try {
    const auth = await requireAuth()
    const companyId = auth.activeCompanyId

    // 1. Fetch existing invoice and check if manual
    const invoice = await db.query.invoices.findFirst({
      where: and(eq(invoices.id, data.invoiceId), eq(invoices.companyId, companyId)),
      with: { items: true }
    })

    if (!invoice) throw new Error('Rechnung nicht gefunden')
    
    const linkedOrder = await db.query.orders.findFirst({
      where: and(eq(orders.invoiceId, invoice.id), eq(orders.companyId, companyId))
    })

    if (linkedOrder?.marketplace !== 'manual') {
      throw new Error('Nur manuell erstellte Rechnungen können bearbeitet werden.')
    }

    if (!data.internalNote?.trim()) {
      throw new Error('Ein interner Vermerk ist für die Bearbeitung zwingend erforderlich.')
    }

    // 2. Perform updates in transaction
    const subtotal = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
    const tax = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice * (item.taxRate / 100)), 0)
    const total = subtotal + tax

    await db.transaction(async (tx) => {
      // a) Create Log Entry
      await tx.insert(invoiceLogs).values({
        invoiceId: invoice.id,
        companyId,
        userId: auth.userId,
        note: data.internalNote,
        action: 'edited'
      })

      // b) Update Invoice Record
      await tx.update(invoices).set({
        recipientName: data.customer.name,
        recipientStreet: data.customer.street,
        recipientZip: data.customer.zip,
        recipientCity: data.customer.city,
        recipientCountry: data.customer.country,
        recipientEmail: data.customer.email,
        subtotalAmount: subtotal.toFixed(2),
        taxAmount: tax.toFixed(2),
        totalAmount: total.toFixed(2),
        taxRate: (tax / subtotal || 0).toFixed(4),
        isCreditNote: data.isCreditNote,
        dueAt: data.dueDate || new Date(),
        currency: data.currency,
        issuedAt: invoice.issuedAt || new Date()
      }).where(eq(invoices.id, invoice.id))

      // c) Refresh Items (Delete and Re-insert)
      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id))
      await tx.insert(invoiceItems).values(
        data.items.map((item, index) => ({
          invoiceId: invoice.id,
          companyId,
          position: (index + 1).toString(),
          sku: item.sku,
          description: item.title,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toFixed(2),
          taxRate: (item.taxRate / 100).toString(),
          lineTotal: (item.quantity * item.unitPrice).toFixed(2),
        }))
      )

      // d) Update Linked Order (for metadata and reporting consistency)
      await tx.update(orders).set({
        buyerName: data.customer.name,
        buyerEmail: data.customer.email,
        shippingName: data.customer.name,
        shippingStreet: data.customer.street,
        shippingZip: data.customer.zip,
        shippingCity: data.customer.city,
        shippingCountry: data.customer.country,
        subtotalAmount: subtotal.toFixed(2),
        taxAmount: tax.toFixed(2),
        totalAmount: total.toFixed(2),
        marketplacePurchaseDate: data.orderDate || new Date(),
        rawPayload: {
          manualMetadata: {
            customText: data.customText,
            taxOption: data.taxOption,
            shippingCountry: data.shippingCountry,
            destinationCountry: data.destinationCountry,
            taxCountry: data.taxCountry,
            orderNumber: data.orderNumber,
            orderDate: data.orderDate,
            buyerReference: data.buyerReference,
            externalId: data.externalId,
            skontoRate: data.skontoRate,
            skontoDays: data.skontoDays,
            discountRate: data.discountRate,
            ossEnabled: data.ossEnabled,
            dueDateDays: data.dueDateDays
          }
        }
      }).where(eq(orders.id, linkedOrder.id))

      // e) Refresh Order Items
      await tx.delete(orderItems).where(eq(orderItems.orderId, linkedOrder.id))
      await tx.insert(orderItems).values(
        data.items.map(item => ({
          orderId: linkedOrder.id,
          companyId,
          title: item.title,
          sku: item.sku,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toFixed(2),
          taxRate: (item.taxRate / 100).toString(),
        }))
      )
    })

    // 3. Regenerate PDF
    const { regenerateInvoicePdf } = await import('@/lib/invoice-service')
    await regenerateInvoicePdf(invoice.id, companyId)

    revalidatePath('/invoices')
    return { success: true }
  } catch (error: any) {
    console.error('[EditManualInvoice] Error:', error)
    return { error: error.message || 'Fehler beim Bearbeiten der Rechnung' }
  }
}

export async function getInvoiceLogsAction(invoiceId: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const logs = await db.query.invoiceLogs.findMany({
    where: and(eq(invoiceLogs.invoiceId, invoiceId), eq(invoiceLogs.companyId, companyId)),
    orderBy: desc(invoiceLogs.createdAt)
  })

  return logs
}

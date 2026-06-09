'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { invoices } from '@/db/schema/invoices'
import { orders } from '@/db/schema/orders'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { getDocumentUrl } from '@/lib/storage'
import { createInvoiceForOrder, regenerateInvoicePdf, getDefaultSettings, formatDocumentNumber } from '@/lib/invoice-service'
import { generateZugferdXml } from '@/lib/e-invoice'
import { companies } from '@/db/schema/companies'
import { invoiceItems, invoiceLogs } from '@/db/schema/invoices'
import { invoiceTextTemplates } from '@/db/schema/templates'

export async function getInvoiceDownloadUrl(invoiceId: string) {
  const auth = await requireAuth()

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.companyId, auth.activeCompanyId)
      )
    )
    .limit(1)

  if (invoice) {
    if (!invoice.pdfStorageKey) {
      throw new Error('Rechnung nicht gefunden oder PDF wurde noch nicht generiert.')
    }
    const url = await getDocumentUrl(invoice.pdfStorageKey)
    return url
  }

  // Fallback: Check orders for a delivery note
  const [order] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, invoiceId),
        eq(orders.companyId, auth.activeCompanyId)
      )
    )
    .limit(1)

  if (order && order.deliveryNoteNumber) {
    const { buildDeliveryNoteKey } = await import('@/lib/storage')
    const key = buildDeliveryNoteKey(auth.activeCompanyId, order.id)
    const url = await getDocumentUrl(key)
    return url
  }

  throw new Error('Rechnung nicht gefunden oder PDF wurde noch nicht generiert.')
}

export async function getInvoiceXmlAction(invoiceId: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
    .limit(1)

  if (!invoice) throw new Error('Invoice not found')

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))

  const xml = generateZugferdXml({
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.createdAt,
    seller: {
      name: company.legalName || company.name,
      vatId: company.vatId || undefined,
      taxId: company.taxId || undefined,
      street: company.street || undefined,
      zip: company.zip || undefined,
      city: company.city || undefined,
      country: company.country,
    },
    buyer: {
      name: invoice.recipientName,
      street: invoice.recipientStreet || undefined,
      zip: invoice.recipientZip || undefined,
      city: invoice.recipientCity || undefined,
      country: invoice.recipientCountry,
    },
    items: items.map(i => ({
      description: i.description,
      quantity: parseFloat(i.quantity),
      unitPrice: parseFloat(i.unitPrice),
      taxRate: parseFloat(i.taxRate) * 100, // expecting percentage
    })),
    currency: invoice.currency,
  })

  return { xml }
}

/**
 * Manually trigger invoice generation for all orders that are missing one.
 * Can be called from a button in the UI for recovery scenarios.
 */
export async function generateMissingInvoicesAction() {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  // Fetch active integrations for the company to check download settings
  const { marketplaceIntegrations } = await import('@/db/schema/integrations')
  const activeIntegrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, companyId),
        eq(marketplaceIntegrations.isActive, true)
      )
    )

  // Find all orders without an invoice
  const ordersWithoutInvoice = await db
    .select({ 
      id: orders.id, 
      marketplaceOrderId: orders.marketplaceOrderId,
      marketplace: orders.marketplace,
      status: orders.status
    })
    .from(orders)
    .where(
      and(
        eq(orders.companyId, companyId),
        isNull(orders.invoiceId)
      )
    )

  console.log(`[Action] Found ${ordersWithoutInvoice.length} orders without invoices. Generating/Downloading...`)

  let generated = 0
  let failed = 0
  const errors: string[] = []

  for (const order of ordersWithoutInvoice) {
    try {
      const integration = activeIntegrations.find(i => 
        i.type === order.marketplace ||
        (i.type === 'mirakl_custom' && 
         ((i.metadata as any)?.customName || '').toLowerCase() === (order.marketplace || '').toLowerCase())
      )
      
      let downloadInvoice = !!(integration?.metadata as any)?.downloadInvoice
      if (integration && !downloadInvoice && !integration.autoInvoice) {
        const cannotCreateInvoice = integration.type === 'otto' || integration.type === 'aboutyou'
        const isMirakl = integration.type.startsWith('mirakl_') || integration.type === 'mirakl_custom'
        if (cannotCreateInvoice || isMirakl) {
          downloadInvoice = true
        }
      }

      if (downloadInvoice && integration) {
        // Skip downloading invoice if the order has not been shipped yet
        if (order.status !== 'shipped') {
          console.log(`[Action] Skipping invoice download for order ${order.marketplaceOrderId} because it is not shipped yet (status: ${order.status}).`)
          continue
        }
        
        // Initialize adapter
        let adapter: any = null
        if (order.marketplace === 'otto') {
          if (integration.clientId && integration.clientSecret) {
            const { OttoAdapter } = await import('@/adapters/marketplace/otto')
            adapter = new OttoAdapter({
              clientId: integration.clientId,
              clientSecret: integration.clientSecret,
              environment: (integration.environment as 'sandbox' | 'production') || 'production',
              installationId: (integration.metadata as any)?.installationId,
              appId: (integration.metadata as any)?.appId,
              connectionType: (integration.metadata as any)?.connectionType || 'service_partner'
            })
          }
        } else if (order.marketplace === 'aboutyou') {
          if (integration.apiKey) {
            const { AboutYouAdapter } = await import('@/adapters/marketplace/aboutyou')
            adapter = new AboutYouAdapter({
              apiKey: integration.apiKey,
              environment: (integration.environment as 'sandbox' | 'production') || 'production'
            })
          }
        } else if (
          (order.marketplace && order.marketplace.startsWith('mirakl_')) ||
          integration.type === 'mirakl_custom'
        ) {
          if (integration.clientId) {
            const { MiraklAdapter } = await import('@/adapters/marketplace/mirakl')
            const customName = integration.type === 'mirakl_custom'
              ? ((integration.metadata as any)?.customName || 'mirakl_custom')
              : integration.type
            adapter = new MiraklAdapter({
              instance: customName.toLowerCase(),
              baseUrl: integration.environment!,
              clientId: integration.clientId,
              clientSecret: integration.clientSecret || '',
              apiKey: integration.apiKey || undefined,
              shopId: (integration.metadata as any)?.shopId || undefined
            })
          }
        }

        if (adapter) {
          const { downloadAndSaveMarketplaceInvoice } = await import('@/workers/marketplace-sync')
          await downloadAndSaveMarketplaceInvoice(order.id, companyId, adapter)

          // Check if invoice was successfully downloaded and linked
          const updatedOrder = await db.query.orders.findFirst({
            where: and(eq(orders.id, order.id), eq(orders.companyId, companyId)),
            columns: { invoiceId: true }
          })

          if (updatedOrder?.invoiceId) {
            generated++
          } else {
            throw new Error(`Marktplatz-Rechnung konnte nicht heruntergeladen werden (Adapter lieferte kein Dokument).`)
          }
        } else {
          throw new Error(`Adapter konnte für ${order.marketplace} nicht initialisiert werden (fehlende Anmeldedaten).`)
        }
      } else {
        const result = await createInvoiceForOrder(order.id, companyId, { txContext: undefined })
        if (result && !result.skipped) {
          generated++
        }
      }
    } catch (err) {
      failed++
      errors.push(`${order.marketplaceOrderId}: ${err instanceof Error ? err.message : String(err)}`)
      console.error(`[Action] Failed to process invoice for order ${order.marketplaceOrderId}:`, err)
    }
  }

  return {
    success: true,
    message: `Fertig: ${generated} Rechnungen verarbeitet, ${failed} Fehler.`,
    errors,
  }
}

export async function regenerateInvoicePdfAction(invoiceId: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  try {
    const [invoice] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
      .limit(1)

    if (invoice) {
      await regenerateInvoicePdf(invoiceId, companyId)
      return { success: true }
    }

    // Fallback: Check orders for a delivery note to regenerate
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, invoiceId),
          eq(orders.companyId, companyId)
        )
      )
      .limit(1)

    if (order && order.deliveryNoteNumber) {
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1)

      const { orderItems } = await import('@/db/schema/orders')
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id))

      const orderWithItems = {
        ...order,
        items: items.map(i => ({
          ...i,
          quantity: parseInt(i.quantity)
        }))
      }

      const { renderToBuffer } = await import('@react-pdf/renderer')
      const { DeliveryNoteDocument } = await import('@/components/pdf/delivery-note')
      const React = await import('react')
      const { uploadDocument, buildDeliveryNoteKey } = await import('@/lib/storage')

      const pdfBuffer = await renderToBuffer(
        React.createElement(DeliveryNoteDocument, {
          order: orderWithItems,
          company: company
        }) as any
      )

      const cacheKey = buildDeliveryNoteKey(companyId, order.id)
      await uploadDocument(cacheKey, pdfBuffer)
      return { success: true }
    }

    throw new Error('Dokument nicht gefunden')
  } catch (err) {
    console.error('[Action] Failed to regenerate document:', err)
    throw new Error('Fehler beim Aktualisieren des Belegs.')
  }
}

export async function getInvoiceDetailsAction(invoiceId: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)),
    with: {
      items: true,
      originalInvoice: true,
      logs: {
        orderBy: (logs, { desc }) => [desc(logs.createdAt)],
        with: {
          user: {
            columns: {
              name: true
            }
          }
        }
      }
    }
  })

  if (invoice) {
    const targetInvoiceId = invoice.cancelsInvoiceId || invoiceId;
    const linkedOrder = await db.query.orders.findFirst({
      where: eq(orders.invoiceId, targetInvoiceId)
    })

    return {
      invoice: {
        ...invoice,
        marketplace: linkedOrder?.marketplace || null,
        marketplaceOrderId: linkedOrder?.marketplaceOrderId || null,
      },
      linkedOrder: linkedOrder || null
    }
  }

  // Fallback: Check orders
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, invoiceId), eq(orders.companyId, companyId)),
    with: {
      items: true
    }
  })

  if (order && order.deliveryNoteNumber) {
    const { buildDeliveryNoteKey } = await import('@/lib/storage')
    const storageKey = buildDeliveryNoteKey(companyId, order.id)

    const mockInvoice = {
      id: order.id,
      companyId: order.companyId,
      documentType: 'delivery_note',
      invoiceNumber: order.deliveryNoteNumber,
      draftName: null,
      status: 'issued',
      recipientName: order.shippingName || order.buyerName || 'Kunde',
      recipientStreet: order.shippingStreet || '',
      recipientZip: order.shippingZip || '',
      recipientCity: order.shippingCity || '',
      recipientCountry: order.shippingCountry || 'DE',
      recipientEmail: order.buyerEmail || null,
      currency: order.currency || 'EUR',
      subtotalAmount: order.subtotalAmount || '0.00',
      taxAmount: order.taxAmount || '0.00',
      totalAmount: order.totalAmount || '0.00',
      taxRate: '0.1900',
      issuedAt: order.createdAt,
      dueAt: order.createdAt,
      pdfStorageKey: storageKey,
      pdfGeneratedAt: order.createdAt,
      isCreditNote: false,
      cancelsInvoiceId: null,
      createdAt: order.createdAt,
      marketplace: order.marketplace || null,
      marketplaceOrderId: order.marketplaceOrderId || null,
      items: order.items.map((item, index) => ({
        id: item.id,
        invoiceId: order.id,
        companyId: order.companyId,
        position: (index + 1).toString(),
        sku: item.sku || '',
        description: item.title,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        lineTotal: (parseFloat(item.unitPrice) * parseFloat(item.quantity)).toFixed(2)
      })),
      logs: []
    }

    return {
      invoice: mockInvoice as any,
      linkedOrder: order
    }
  }

  throw new Error('Rechnung nicht gefunden')
}

export async function addInvoiceLogAction(invoiceId: string, action: string, note: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const [invoice] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
    .limit(1)

  if (!invoice) throw new Error('Rechnung nicht gefunden')

  await db.insert(invoiceLogs).values({
    invoiceId,
    companyId,
    userId: auth.userId,
    action,
    note: note.trim()
  })

  return { success: true }
}

export async function markInvoiceAsPaidAction(invoiceId: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const [invoice] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
    .limit(1)

  if (!invoice) throw new Error('Rechnung nicht gefunden')

  // Mark the invoice as paid (enables efficient dunning worker filtering)
  await db
    .update(invoices)
    .set({ paidAt: new Date() })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))

  await db.insert(invoiceLogs).values({
    invoiceId,
    companyId,
    userId: auth.userId,
    action: 'payment',
    note: 'Zahlungseingang erfasst. Das Dokument ist vollständig bezahlt.'
  })

  return { success: true }
}

export async function cancelInvoiceAction(invoiceId: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Fetch original invoice
      const invoice = await tx.query.invoices.findFirst({
        where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)),
        with: { items: true }
      })

      if (!invoice) throw new Error('Rechnung nicht gefunden')
      if (invoice.status === 'cancelled') throw new Error('Rechnung ist bereits storniert')
      if (invoice.documentType !== 'invoice') throw new Error('Nur Rechnungen können storniert werden')
      // Removed restriction on cancelling credit notes so users can cancel Gutschriften too

      // 2. Fetch company document settings
      const [company] = await tx
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .for('update')
      if (!company) throw new Error('Mandant nicht gefunden')

      // 3. Generate cancellation invoice number (Stornonummer)
      // For cancellations, the Storno invoice number is exactly the same as the original invoice's number.
      const cancelsInvoiceNumber = invoice.invoiceNumber


      // 4. Create new invoice as a credit note (cancellation)
      const [cancellationInvoice] = await tx
        .insert(invoices)
        .values({
          companyId,
          invoiceNumber: cancelsInvoiceNumber,
          status: 'issued',
          documentType: 'invoice',
          recipientName: invoice.recipientName,
          recipientStreet: invoice.recipientStreet,
          recipientZip: invoice.recipientZip,
          recipientCity: invoice.recipientCity,
          recipientCountry: invoice.recipientCountry,
          recipientEmail: invoice.recipientEmail,
          currency: invoice.currency,
          subtotalAmount: invoice.subtotalAmount,
          taxAmount: invoice.taxAmount,
          totalAmount: invoice.totalAmount,
          taxRate: invoice.taxRate,
          isCreditNote: true,
          cancelsInvoiceId: invoice.id,
          dueAt: new Date(),
          issuedAt: new Date()
        })
        .returning({ id: invoices.id })

      // Copy items
      if (invoice.items.length > 0) {
        await tx.insert(invoiceItems).values(
          invoice.items.map((item, index) => ({
            invoiceId: cancellationInvoice.id,
            companyId,
            position: (index + 1).toString(),
            sku: item.sku,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            lineTotal: item.lineTotal,
          }))
        )
      }

      // 5. Update original invoice status to 'cancelled'
      await tx.update(invoices)
        .set({ status: 'cancelled' })
        .where(eq(invoices.id, invoice.id))

      // 6. Add logs
      await tx.insert(invoiceLogs).values([
        {
          invoiceId: invoice.id,
          companyId,
          userId: auth.userId,
          action: 'edited',
          note: `Rechnung wurde storniert. Stornobeleg ${cancelsInvoiceNumber} wurde erstellt.`
        },
        {
          invoiceId: cancellationInvoice.id,
          companyId,
          userId: auth.userId,
          action: 'edited',
          note: `Stornobeleg für Rechnung ${invoice.invoiceNumber} erstellt.`
        }
      ])

      return {
        success: true,
        cancellationInvoiceId: cancellationInvoice.id,
        cancellationInvoiceNumber: cancelsInvoiceNumber
      }
    })

    if (result.success && result.cancellationInvoiceId) {
      try {
        await regenerateInvoicePdf(result.cancellationInvoiceId, companyId)
      } catch (err) {
        console.error('[CancelInvoice] Failed to generate PDF:', err)
      }
    }

    const { revalidatePath } = await import('next/cache')
    revalidatePath('/invoices')

    return result
  } catch (err: any) {
    console.error('[Action] Failed to cancel invoice:', err)
    throw new Error(err.message || 'Fehler beim Stornieren der Rechnung.')
  }
}

export async function getInvoiceDetailsForCloneAction(invoiceId: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)),
    with: { items: true }
  })

  if (!invoice) throw new Error('Dokument nicht gefunden')

  const linkedOrder = await db.query.orders.findFirst({
    where: eq(orders.invoiceId, invoiceId)
  })

  const metadata = (linkedOrder?.rawPayload as any)?.manualMetadata || {}

  return {
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      createdAt: invoice.createdAt,
      recipientName: invoice.recipientName,
      recipientStreet: invoice.recipientStreet || '',
      recipientZip: invoice.recipientZip || '',
      recipientCity: invoice.recipientCity || '',
      recipientCountry: invoice.recipientCountry || 'DE',
      recipientEmail: invoice.recipientEmail || '',
      currency: invoice.currency || 'EUR',
      taxRate: parseFloat(invoice.taxRate) * 100,
      customText: metadata.customText || '',
      taxOption: metadata.taxOption || 'standard',
      shippingCountry: metadata.shippingCountry || invoice.recipientCountry || 'DE',
      destinationCountry: metadata.destinationCountry || invoice.recipientCountry || 'DE',
      taxCountry: metadata.taxCountry || 'DE',
      orderNumber: metadata.orderNumber || linkedOrder?.marketplaceOrderId || '',
      orderDate: metadata.orderDate 
        ? new Date(metadata.orderDate).toISOString().split('T')[0] 
        : (linkedOrder?.marketplacePurchaseDate 
          ? new Date(linkedOrder.marketplacePurchaseDate).toISOString().split('T')[0] 
          : ''),
      buyerReference: metadata.buyerReference || '',
      externalId: metadata.externalId || '',
      skontoRate: metadata.skontoRate || 0,
      skontoDays: metadata.skontoDays || 7,
      discountRate: metadata.discountRate || 0,
      ossEnabled: metadata.ossEnabled || false,
      dueDateDays: metadata.dueDateDays || 14,
      customerNumber: linkedOrder?.customerNumber || '',
    },
    items: invoice.items.map(i => ({
      sku: i.sku || '',
      title: i.description,
      quantity: parseFloat(i.quantity),
      unitPrice: parseFloat(i.unitPrice),
      taxRate: parseFloat(i.taxRate) * 100
    }))
  }
}

export async function sendInvoiceEmailAction(data: {
  invoiceId: string
  recipientEmail: string
  ccEmail?: string
  subject: string
  messageText: string
  sendAsAttachment?: boolean
  senderEmail: string
}) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  try {
    // 1. Fetch invoice and company details
    const invoice = await db.query.invoices.findFirst({
      where: and(eq(invoices.id, data.invoiceId), eq(invoices.companyId, companyId))
    })

    if (!invoice) throw new Error('Dokument nicht gefunden')

    const label = invoice.documentType === 'quote' ? 'Angebot' : (invoice.isCreditNote ? 'Gutschrift' : 'Rechnung')

    const [company] = await db
      .select({ 
        email: companies.email, 
        name: companies.name,
        smtpSettings: companies.smtpSettings
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    const replyTo = company?.email || ''

    // 2. Download PDF if sending as attachment
    let pdfBuffer: Buffer | undefined
    let pdfFilename: string | undefined

    if (data.sendAsAttachment !== false && invoice.pdfStorageKey) {
      const { downloadDocument } = await import('@/lib/storage')
      pdfBuffer = await downloadDocument(invoice.pdfStorageKey)
      pdfFilename = `${label}-${invoice.invoiceNumber}.pdf`
    }

    // Determine if custom SMTP should be used
    let smtpConfig: any = undefined
    if (
      company?.smtpSettings?.enabled &&
      company.smtpSettings.fromEmail &&
      data.senderEmail === company.smtpSettings.fromEmail
    ) {
      smtpConfig = company.smtpSettings
    }

    // 3. Send Email
    const { sendInvoiceEmail } = await import('@/lib/email')
    const emailResult = await sendInvoiceEmail({
      toEmail: data.recipientEmail,
      ccEmail: data.ccEmail,
      replyTo,
      subject: data.subject,
      html: data.messageText,
      pdfBuffer,
      pdfFilename,
      smtpConfig
    })

    if (!emailResult.success) {
      throw new Error((emailResult.error as any)?.message || 'Fehler beim E-Mail-Dienst')
    }

    // 4. Create log entry
    const logMessage = `${label} wurde per E-Mail versendet.
Absender: ${data.senderEmail}
Empfänger: ${data.recipientEmail}
${data.ccEmail ? `CC: ${data.ccEmail}\n` : ''}Betreff: ${data.subject}`

    await db.insert(invoiceLogs).values({
      invoiceId: invoice.id,
      companyId,
      userId: auth.userId,
      action: 'email',
      note: logMessage
    })

    return { success: true }
  } catch (err: any) {
    console.error('[Action] Failed to send invoice email:', err)
    
    let errorMessage = err.message || 'Fehler beim Versenden der E-Mail.'
    const lowerMessage = errorMessage.toLowerCase()
    
    if (
      lowerMessage.includes("invalid `to` field") || 
      lowerMessage.includes("invalid 'to' field") || 
      lowerMessage.includes("invalid to field") ||
      lowerMessage.includes("recipient address rejected") ||
      (lowerMessage.includes("invalid address") && lowerMessage.includes("recipient"))
    ) {
      errorMessage = "Die E-Mail-Adresse des Empfängers ist ungültig. Bitte gib eine korrekte E-Mail-Adresse an."
    } else if (
      lowerMessage.includes("invalid `cc` field") || 
      lowerMessage.includes("invalid 'cc' field") || 
      lowerMessage.includes("invalid cc field")
    ) {
      errorMessage = "Die E-Mail-Adresse unter 'Weitere Empfänger' ist ungültig."
    } else if (
      lowerMessage.includes("invalid `from` field") || 
      lowerMessage.includes("invalid 'from' field") || 
      lowerMessage.includes("invalid from field") ||
      lowerMessage.includes("sender address rejected") ||
      (lowerMessage.includes("invalid address") && lowerMessage.includes("sender"))
    ) {
      errorMessage = "Die Absender-E-Mail-Adresse ist ungültig. Bitte überprüfe deine E-Mail-Konfiguration."
    } else if (lowerMessage.includes("rate limit")) {
      errorMessage = "E-Mail-Limit überschritten. Bitte versuche es in wenigen Minuten erneut."
    }

    return { error: errorMessage }
  }
}

export async function saveEmailTemplateAction(content: string, templateName: string = 'email_invoice_default') {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  try {
    const existing = await db
      .select()
      .from(invoiceTextTemplates)
      .where(
        and(
          eq(invoiceTextTemplates.companyId, companyId),
          eq(invoiceTextTemplates.name, templateName)
        )
      )
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(invoiceTextTemplates)
        .set({ content })
        .where(eq(invoiceTextTemplates.id, existing[0].id))
    } else {
      await db
        .insert(invoiceTextTemplates)
        .values({
          companyId,
          name: templateName,
          content
        })
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Action] Failed to save email template:', err)
    return { error: err.message || 'Fehler beim Speichern der Vorlage.' }
  }
}

export async function recordPaymentAction(invoiceId: string, data: {
  date: string
  method: string
  provider?: string
  reference?: string
  note?: string
  amount: string
  isSettled?: boolean
}) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const [invoice] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
    .limit(1)

  if (!invoice) throw new Error('Rechnung nicht gefunden')

  const paymentDate = data.date ? new Date(data.date) : new Date()

  await db
    .update(invoices)
    .set({ paidAt: paymentDate })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))

  const noteMessage = `Zahlungseingang erfasst.
Betrag: ${data.amount} €
Datum: ${data.date}
Zahlung per: ${data.method}
${data.provider ? `Zahlungsdienstleister: ${data.provider}\n` : ''}${data.reference ? `Referenz: ${data.reference}\n` : ''}${data.note ? `Bemerkung: ${data.note}\n` : ''}${data.isSettled ? 'Restbetrag als Skonto/Nachlass verbucht (vollständig bezahlt).' : ''}`

  await db.insert(invoiceLogs).values({
    invoiceId,
    companyId,
    userId: auth.userId,
    action: 'payment',
    note: noteMessage.trim()
  })

  return { success: true }
}

export async function sendDunningNoticeAction(data: {
  invoiceId: string
  type: 'reminder' | 'first' | 'second'
  subject: string
  body: string
  recipientEmail: string
  senderEmail: string
  dunningFee?: string
}) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId
  const stageLabel = data.type === 'reminder' ? 'Zahlungserinnerung' : data.type === 'first' ? '1. Mahnung' : '2. Mahnung'

  if (data.dunningFee && parseFloat(data.dunningFee) > 0) {
    const { addDunningFeeToInvoice } = await import('@/lib/invoice-service')
    await addDunningFeeToInvoice(data.invoiceId, companyId, data.dunningFee, stageLabel)
  }

  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, data.invoiceId), eq(invoices.companyId, companyId))
  })
  if (!invoice) throw new Error('Rechnung nicht gefunden')

  const [company] = await db
    .select({ email: companies.email, name: companies.name, smtpSettings: companies.smtpSettings })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  // Download PDF attachment
  let pdfBuffer: Buffer | undefined
  let pdfFilename: string | undefined
  if (invoice.pdfStorageKey) {
    const { downloadDocument } = await import('@/lib/storage')
    pdfBuffer = await downloadDocument(invoice.pdfStorageKey)
    pdfFilename = `Rechnung-${invoice.invoiceNumber}.pdf`
  }

  // Determine SMTP config
  let smtpConfig: any = undefined
  if (company?.smtpSettings?.enabled && company.smtpSettings.fromEmail && data.senderEmail === company.smtpSettings.fromEmail) {
    smtpConfig = company.smtpSettings
  }
  // Send email
  const { sendInvoiceEmail } = await import('@/lib/email')
  const emailResult = await sendInvoiceEmail({
    toEmail: data.recipientEmail,
    replyTo: company?.email || '',
    subject: data.subject,
    html: data.body.replace(/\n/g, '<br>'),
    pdfBuffer,
    pdfFilename,
    smtpConfig
  })

  if (!emailResult.success) {
    // Log failure in dunningLogs
    const { dunningLogs } = await import('@/db/schema/dunning')
    await db.insert(dunningLogs).values({
      companyId,
      invoiceId: data.invoiceId,
      stage: data.type,
      status: 'failed',
      recipientEmail: data.recipientEmail,
      subject: data.subject,
      errorMessage: String((emailResult.error as any)?.message || 'Unbekannter Fehler'),
      triggeredByUserId: auth.userId,
    })
    throw new Error((emailResult.error as any)?.message || 'Fehler beim E-Mail-Dienst')
  }

  // Log success in dunningLogs
  const { dunningLogs } = await import('@/db/schema/dunning')
  await db.insert(dunningLogs).values({
    companyId,
    invoiceId: data.invoiceId,
    stage: data.type,
    status: 'sent',
    recipientEmail: data.recipientEmail,
    subject: data.subject,
    triggeredByUserId: auth.userId,
  })

  // Log in invoiceLogs for the activity trail
  const feeNote = data.dunningFee ? `\nMahngebühr: ${data.dunningFee} €` : ''
  const logNote = `${stageLabel} manuell versendet.\nAbsender: ${data.senderEmail}\nEmpfänger: ${data.recipientEmail}\nBetreff: ${data.subject}${feeNote}`

  await db.insert(invoiceLogs).values({
    invoiceId: data.invoiceId,
    companyId,
    userId: auth.userId,
    action: 'email',
    note: logNote,
  })

  return { success: true }
}

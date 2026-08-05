'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { invoices, invoiceItems, invoiceLogs } from '@/db/schema/invoices'
import { companies } from '@/db/schema/companies'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import { getAdapterForIntegration } from '@/workers/marketplace-sync'
import { buildInvoiceKey, uploadDocument } from '@/lib/storage'
import { getDefaultSettings, formatDocumentNumber } from '@/lib/invoice-service'
import React from 'react'
import { after } from 'next/server'

export async function applyDecathlonPriceReductionAction(orderId: string, positionItemId: string, amount: number, reason: string) {
  try {
    const auth = await requireAuth()
    const companyId = auth.activeCompanyId

    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.companyId, companyId)),
      with: { items: true }
    })

    if (!order || order.marketplace !== 'Decathlon DE') {
      return { error: 'Bestellung nicht gefunden oder kein Decathlon-Auftrag.' }
    }

    if (!order.invoiceId) {
      return { error: 'Es muss zuerst eine reguläre Rechnung existieren, bevor eine Teilerstattung durchgeführt werden kann.' }
    }

    const originalInvoice = await db.query.invoices.findFirst({
      where: and(eq(invoices.id, order.invoiceId), eq(invoices.companyId, companyId))
    })

    if (!originalInvoice) {
      return { error: 'Ursprüngliche Rechnung nicht gefunden.' }
    }
    
    if (originalInvoice.status === 'cancelled') {
      return { error: 'Die Original-Rechnung ist bereits storniert.' }
    }

    const integration = await db.query.marketplaceIntegrations.findFirst({
      where: and(
        eq(marketplaceIntegrations.companyId, companyId),
        eq(marketplaceIntegrations.type, 'mirakl_decathlon'),
        eq(marketplaceIntegrations.isActive, true)
      )
    })

    if (!integration) {
      return { error: 'Decathlon Integration nicht gefunden oder inaktiv.' }
    }

    const adapter = getAdapterForIntegration(integration) as any
    if (!adapter || !adapter.applyPriceReduction) {
      return { error: 'Fehler beim Initialisieren des Decathlon Adapters.' }
    }

    // 1. Notify Mirakl API about the price reduction
    await adapter.applyPriceReduction(order.marketplaceOrderId, positionItemId, amount, reason)

    // 2. Generate the Credit Note PDF locally
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
    if (!company) {
      return { error: 'Unternehmen nicht gefunden.' }
    }

    const dbSettings = company.documentNumberSettings as any
    const config = dbSettings?.creditNote || getDefaultSettings('creditNote', company)

    let creditNoteNumber = `GS-${Date.now()}`
    if (config && config.auto) {
      const nextNum = parseInt(config.next, 10) || 1
      const padding = config.padding || 5
      creditNoteNumber = formatDocumentNumber(
        config.format,
        nextNum,
        padding,
        order.customerNumber || '',
        '',
        new Date()
      )
    }

    // Prepare Credit Note Items
    const rawPayload = order.rawPayload as any
    const orderLines = rawPayload?.order_lines || rawPayload?.positionItems || []
    
    // Attempt to find the specific item by order_line_id to get correct taxes and SKU
    const matchedLine = orderLines.find((l: any) => l.order_line_id === positionItemId || l.positionItemId === positionItemId)
    let sku = 'REFUND'
    let title = 'Teilerstattung'
    let taxRate = 0
    
    if (matchedLine) {
       sku = matchedLine.offer_sku || matchedLine.product_sku || matchedLine.product?.sku || sku
       const matchedDbItem = order.items.find((i: any) => i.sku === sku)
       if (matchedDbItem) {
          title = `Teilerstattung für: ${matchedDbItem.title}`
          taxRate = parseFloat(matchedDbItem.taxRate)
       }
    }
    
    // Calculate net and tax amounts based on gross amount provided
    const grossAmount = amount
    const netAmount = grossAmount / (1 + taxRate)
    const taxAmount = grossAmount - netAmount

    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { InvoiceDocument } = await import('@/components/pdf/invoice')
    const { fetchImageAsBase64 } = await import('@/lib/image-fetcher')
    const logoBase64 = await fetchImageAsBase64(company.logoUrl || undefined)

    const pdfBuffer = await renderToBuffer(
      React.createElement(InvoiceDocument, {
        invoiceNumber: creditNoteNumber,
        date: new Date(),
        dueDate: new Date(),
        orderNumber: order.marketplaceOrderId,
        orderDate: order.marketplacePurchaseDate || undefined,
        customerNumber: order.customerNumber || '–',
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
          logoUrl: logoBase64 || undefined,
          paymentRecipient: company.paymentRecipient || undefined,
          management: company.management || undefined,
          registrationCourt: company.registrationCourt || undefined,
          internationalLanguage: company.internationalLanguage || undefined,
          footerText: company.invoiceFooter || undefined,
          footerTextEn: company.invoiceFooterEn || undefined,
        },
        recipient: {
          name: originalInvoice.recipientName,
          street: originalInvoice.recipientStreet || '',
          zip: originalInvoice.recipientZip || '',
          city: originalInvoice.recipientCity || '',
          country: originalInvoice.recipientCountry || 'DE',
        },
        items: [{
          sku: sku,
          title: title,
          quantity: 1,
          unitPrice: netAmount,
          taxRate: taxRate,
        }],
        currency: order.currency || 'EUR',
        paymentMethod: 'Marketplace',
        isCreditNote: true,
        documentType: 'invoice',
        cancelsInvoiceNumber: originalInvoice.invoiceNumber,
        cancelsInvoiceDate: originalInvoice.createdAt || undefined,
      }) as any
    )

    const storageKey = buildInvoiceKey(companyId, creditNoteNumber)
    await uploadDocument(storageKey, pdfBuffer)

    let newCreditNoteInvoiceId = ''

    await db.transaction(async (tx) => {
      const [dbCompany] = await tx
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .for('update')

      if (dbCompany) {
        const currentSettings = dbCompany.documentNumberSettings as any || {}
        const cfg = currentSettings.creditNote || getDefaultSettings('creditNote', dbCompany)
        if (cfg && cfg.auto) {
          const nextNum = parseInt(cfg.next, 10) || 1
          const updatedSettings = {
            ...currentSettings,
            creditNote: {
              ...cfg,
              next: (nextNum + 1).toString()
            }
          }
          await tx.update(companies)
            .set({ documentNumberSettings: updatedSettings, updatedAt: new Date() })
            .where(eq(companies.id, companyId))
        }
      }

      const [newInvoice] = await tx.insert(invoices).values({
        companyId: companyId,
        documentType: 'invoice',
        invoiceNumber: creditNoteNumber,
        status: 'issued',
        recipientName: originalInvoice.recipientName,
        recipientStreet: originalInvoice.recipientStreet,
        recipientZip: originalInvoice.recipientZip,
        recipientCity: originalInvoice.recipientCity,
        recipientCountry: originalInvoice.recipientCountry,
        recipientEmail: originalInvoice.recipientEmail,
        currency: originalInvoice.currency || 'EUR',
        subtotalAmount: netAmount.toFixed(2), 
        taxAmount: taxAmount.toFixed(2), 
        totalAmount: grossAmount.toFixed(2),
        taxRate: taxRate.toFixed(4),
        dueAt: new Date(),
        pdfStorageKey: storageKey,
        pdfGeneratedAt: new Date(),
        issuedAt: new Date(),
        isCreditNote: true,
        cancelsInvoiceId: originalInvoice.id
      }).returning({ id: invoices.id })

      newCreditNoteInvoiceId = newInvoice.id

      await tx.insert(invoiceItems).values({
        invoiceId: newInvoice.id,
        companyId: companyId,
        position: '1',
        sku: sku,
        description: title,
        quantity: '1',
        unitPrice: netAmount.toFixed(2),
        taxRate: taxRate.toString(),
        lineTotal: netAmount.toFixed(2),
      })
      
      const sessionUserId = (auth as any).userId || null
      await tx.insert(invoiceLogs).values([
        {
          invoiceId: originalInvoice.id,
          companyId,
          userId: sessionUserId,
          action: 'edited',
          note: `Gutschrift ${creditNoteNumber} (Teilerstattung) wurde erzeugt.`
        },
        {
          invoiceId: newInvoice.id,
          companyId,
          userId: sessionUserId,
          action: 'edited',
          note: `Gutschrift für Teilerstattung erzeugt.`
        }
      ])
    })

    // 4. Upload Credit Note to Mirakl
    if (adapter.uploadInvoice) {
      after(async () => {
        try {
          console.log(`[DecathlonRefund] Uploading credit note ${creditNoteNumber} to Decathlon...`)
          await adapter.uploadInvoice?.(
            order.marketplaceOrderId,
            pdfBuffer,
            `${creditNoteNumber}.pdf`,
            true // isCreditNote = true
          )
          console.log(`[DecathlonRefund] Credit note uploaded successfully.`)
        } catch (err) {
          console.error(`[DecathlonRefund] Failed to upload credit note PDF:`, err)
        }
      })
    }

    return { 
      success: true, 
      message: 'Teilerstattung erfolgreich gemeldet und Gutschrift generiert.',
      invoiceId: newCreditNoteInvoiceId
    }

  } catch (error: any) {
    console.error('Error applying Decathlon price reduction:', error)
    return { error: error.message || 'Fehler bei der Teilerstattung.' }
  }
}

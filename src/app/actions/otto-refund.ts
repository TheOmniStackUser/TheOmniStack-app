'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { invoices, invoiceItems } from '@/db/schema/invoices'
import { companies } from '@/db/schema/companies'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import { getAdapterForIntegration } from '@/workers/marketplace-sync'
import type { OttoAdapter } from '@/adapters/marketplace/otto'
import { buildInvoiceKey, uploadDocument } from '@/lib/storage'

export async function applyOttoPriceReductionAction(orderId: string, positionItemId: string, amount: number, reason: string) {
  try {
    const auth = await requireAuth()

    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.companyId, auth.activeCompanyId)),
      with: { items: true }
    })

    if (!order || order.marketplace !== 'otto') {
      return { error: 'Bestellung nicht gefunden oder kein OTTO-Auftrag.' }
    }

    if (!order.invoiceId) {
      return { error: 'Es muss zuerst eine reguläre Rechnung existieren, bevor eine Teilerstattung durchgeführt werden kann.' }
    }

    const originalInvoice = await db.query.invoices.findFirst({
      where: and(eq(invoices.id, order.invoiceId), eq(invoices.companyId, auth.activeCompanyId))
    })

    if (!originalInvoice) {
      return { error: 'Ursprüngliche Rechnung nicht gefunden.' }
    }

    const integration = await db.query.marketplaceIntegrations.findFirst({
      where: and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.type, 'otto'),
        eq(marketplaceIntegrations.isActive, true)
      )
    })

    if (!integration) {
      return { error: 'OTTO Integration nicht gefunden oder inaktiv.' }
    }

    const adapter = getAdapterForIntegration(integration) as OttoAdapter
    if (!adapter || !adapter.applyPriceReduction) {
      return { error: 'Fehler beim Initialisieren des OTTO Adapters.' }
    }

    // 1. Notify OTTO API about the price reduction
    await adapter.applyPriceReduction(order.marketplaceOrderId, positionItemId, amount, reason)

    // 2. Poll for the generated refund receipt
    // OTTO might take a few seconds to generate it, so we retry a few times
    let refundReceipt: { pdfBuffer: Buffer; receiptNumber: string } | null = null
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 2000)) // Wait 2s before each attempt
      refundReceipt = await adapter.getRefundReceipt(order.marketplaceOrderId)
      if (refundReceipt) break
    }

    if (!refundReceipt) {
      return { 
        success: true, 
        message: 'Erstattung wurde an OTTO gemeldet, aber die Gutschrift (PDF) konnte noch nicht automatisch heruntergeladen werden. Sie wird beim nächsten Sync importiert.'
      }
    }

    // 3. We have the PDF from OTTO. Save it as a credit note.
    const creditNoteNumber = refundReceipt.receiptNumber || `GS-OTTO-${Date.now()}`
    const storageKey = buildInvoiceKey(auth.activeCompanyId, creditNoteNumber)
    
    await uploadDocument(storageKey, refundReceipt.pdfBuffer)

    const [newInvoice] = await db.insert(invoices).values({
      companyId: auth.activeCompanyId,
      documentType: 'invoice',
      invoiceNumber: creditNoteNumber,
      status: 'issued',
      recipientName: originalInvoice.recipientName,
      recipientStreet: originalInvoice.recipientStreet,
      recipientZip: originalInvoice.recipientZip,
      recipientCity: originalInvoice.recipientCity,
      recipientCountry: originalInvoice.recipientCountry,
      recipientEmail: originalInvoice.recipientEmail,
      currency: originalInvoice.currency,
      subtotalAmount: amount.toFixed(2), // We store the refunded amount
      taxAmount: '0.00', // Depends on tax rate, simplified for now or let Otto's PDF speak for itself
      totalAmount: amount.toFixed(2),
      taxRate: '0.0000',
      dueAt: new Date(),
      pdfStorageKey: storageKey,
      pdfGeneratedAt: new Date(),
      issuedAt: new Date(),
      paidAt: new Date(),
      isCreditNote: true,
      cancelsInvoiceId: originalInvoice.id
    }).returning({ id: invoices.id })

    // Insert an item for the credit note
    await db.insert(invoiceItems).values({
      invoiceId: newInvoice.id,
      companyId: auth.activeCompanyId,
      position: '1',
      sku: 'REFUND',
      description: `Gutschrift für Bestellung ${order.marketplaceOrderId}`,
      quantity: '1',
      unitPrice: amount.toFixed(2),
      taxRate: '0.00',
      lineTotal: amount.toFixed(2),
    })

    return { 
      success: true, 
      message: 'Teilerstattung erfolgreich gemeldet und Gutschrift heruntergeladen.',
      invoiceId: newInvoice.id
    }

  } catch (error: any) {
    console.error('Error applying Otto price reduction:', error)
    return { error: error.message || 'Fehler bei der Teilerstattung.' }
  }
}

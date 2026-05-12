'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { invoices } from '@/db/schema/invoices'
import { orders } from '@/db/schema/orders'
import { eq, and, isNull } from 'drizzle-orm'
import { getDocumentUrl } from '@/lib/storage'
import { createInvoiceForOrder, regenerateInvoicePdf } from '@/lib/invoice-service'
import { generateZugferdXml } from '@/lib/e-invoice'
import { companies } from '@/db/schema/companies'
import { invoiceItems } from '@/db/schema/invoices'

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

  if (!invoice || !invoice.pdfStorageKey) {
    throw new Error('Rechnung nicht gefunden oder PDF wurde noch nicht generiert.')
  }

  const url = await getDocumentUrl(invoice.pdfStorageKey)
  return url
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

  // Find all orders without an invoice
  const ordersWithoutInvoice = await db
    .select({ id: orders.id, marketplaceOrderId: orders.marketplaceOrderId })
    .from(orders)
    .where(
      and(
        eq(orders.companyId, companyId),
        isNull(orders.invoiceId)
      )
    )

  console.log(`[Action] Found ${ordersWithoutInvoice.length} orders without invoices. Generating...`)

  let generated = 0
  let failed = 0
  const errors: string[] = []

  for (const order of ordersWithoutInvoice) {
    try {
      const result = await createInvoiceForOrder(order.id, companyId, { txContext: undefined })
      if (result && !result.skipped) {
        generated++
      }
    } catch (err) {
      failed++
      errors.push(`${order.marketplaceOrderId}: ${err instanceof Error ? err.message : String(err)}`)
      console.error(`[Action] Failed to generate invoice for order ${order.marketplaceOrderId}:`, err)
    }
  }

  return {
    success: true,
    message: `Fertig: ${generated} Rechnungen generiert, ${failed} Fehler.`,
    errors,
  }
}

export async function regenerateInvoicePdfAction(invoiceId: string) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  try {
    await regenerateInvoicePdf(invoiceId, companyId)
    return { success: true }
  } catch (err) {
    console.error('[Action] Failed to regenerate invoice:', err)
    throw new Error('Fehler beim Aktualisieren der Rechnung.')
  }
}

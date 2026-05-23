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
      const integration = activeIntegrations.find(i => i.type === order.marketplace)
      const downloadInvoice = !!(integration?.metadata as any)?.downloadInvoice

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
              appId: (integration.metadata as any)?.appId
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
    await regenerateInvoicePdf(invoiceId, companyId)
    return { success: true }
  } catch (err) {
    console.error('[Action] Failed to regenerate invoice:', err)
    throw new Error('Fehler beim Aktualisieren der Rechnung.')
  }
}

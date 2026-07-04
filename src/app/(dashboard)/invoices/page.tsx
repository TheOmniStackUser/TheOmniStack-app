import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { invoices } from '@/db/schema/invoices'
import { orders } from '@/db/schema/orders'
import { eq, desc, and, ne, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import Link from 'next/link'
import { InvoiceList } from './invoice-list'
import { GenerateMissingButton } from './generate-missing-button'
import { DraftsDropdown } from './drafts-dropdown'
import { getDraftsAction } from '@/app/actions/manual-invoice'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { companies } from '@/db/schema/companies'
import { invoiceTextTemplates } from '@/db/schema/templates'
import { users } from '@/db/schema/auth'
import { dunningLogs } from '@/db/schema/dunning'

const originalInvoice = alias(invoices, 'original_invoice')

export default async function InvoicesPage() {
  const auth = await requireAuth()
  const drafts = await getDraftsAction()

  const [allInvoices, companyDunningLogs, integrations, company, emailTemplate, currentUser] = await Promise.all([
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        recipientName: invoices.recipientName,
        recipientCountry: invoices.recipientCountry,
        totalAmount: invoices.totalAmount,
        currency: invoices.currency,
        createdAt: invoices.createdAt,
        pdfStorageKey: invoices.pdfStorageKey,
        marketplace: orders.marketplace,
        marketplaceOrderId: orders.marketplaceOrderId,
        rawPayload: orders.rawPayload,
        cancelsInvoiceId: invoices.cancelsInvoiceId,
        isCreditNote: invoices.isCreditNote,
        documentType: invoices.documentType,
        originalInvoiceNumber: originalInvoice.invoiceNumber,
        originalInvoiceCreatedAt: originalInvoice.createdAt,
        dueAt: invoices.dueAt,
        paidAt: invoices.paidAt,
        draftName: invoices.draftName,
      })
      .from(invoices)
      .leftJoin(orders, or(eq(invoices.id, orders.invoiceId), eq(invoices.cancelsInvoiceId, orders.invoiceId)))
      .leftJoin(originalInvoice, eq(invoices.cancelsInvoiceId, originalInvoice.id))
      .where(and(
        eq(invoices.companyId, auth.activeCompanyId),
        eq(invoices.documentType, 'invoice')
      ))
      .orderBy(desc(invoices.createdAt)),
    db
      .select({
        invoiceId: dunningLogs.invoiceId,
        stage: dunningLogs.stage,
        sentAt: dunningLogs.sentAt,
      })
      .from(dunningLogs)
      .where(and(
        eq(dunningLogs.companyId, auth.activeCompanyId),
        eq(dunningLogs.status, 'sent')
      ))
      .orderBy(desc(dunningLogs.sentAt)),
    db.query.marketplaceIntegrations.findMany({
      where: and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.isActive, true)
      )
    }),
    db
      .select({
        email: companies.email,
        smtpSettings: companies.smtpSettings,
      })
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)
      .then(rows => rows[0] || null),
    db
      .select({
        content: invoiceTextTemplates.content,
      })
      .from(invoiceTextTemplates)
      .where(and(
        eq(invoiceTextTemplates.companyId, auth.activeCompanyId),
        eq(invoiceTextTemplates.name, 'email_invoice_default')
      ))
      .limit(1)
      .then(rows => rows[0]?.content || null),
    db
      .select({
        name: users.name,
      })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1)
      .then(rows => rows[0] || null)
  ])

  const customMiraklIntegrations = integrations.filter(i => i.type === 'mirakl_custom')

  const hasKauflandIntegration = integrations.some(i => i.type === 'kaufland' && i.clientId && i.clientSecret)
  const hasEbayIntegration = integrations.some(i => i.type === 'ebay' && i.clientId && i.clientSecret)
  const hasOttoIntegration = integrations.some(i => i.type === 'otto' && i.clientId)
  const hasAboutYouIntegration = integrations.some(i => i.type === 'aboutyou' && i.apiKey)
  const hasDecathlonIntegration = integrations.some(i => i.type === 'mirakl_decathlon' && i.clientId)
  const hasDecathlonEuIntegration = integrations.some(i => i.type === 'mirakl_decathlon_eu' && i.clientId)
  const hasMediamarktIntegration = integrations.some(i => i.type === 'mirakl_mediamarkt' && i.clientId)
  const hasAmazonIntegration = integrations.some(i => i.type === 'amazon' && i.refreshToken)
  const hasShopifyIntegration = integrations.some(i => i.type === 'shopify' && i.accessToken)

  const uniqueInvoicesMap = new Map()
  for (const inv of allInvoices) {
    if (!uniqueInvoicesMap.has(inv.id)) {
      uniqueInvoicesMap.set(inv.id, inv)
    } else {
      // If we find a duplicate (happens with manual credit notes matching two orders),
      // prefer the original marketplace over the "manual" ghost order.
      if (inv.marketplace !== 'manual') {
        uniqueInvoicesMap.set(inv.id, inv)
      }
    }
  }
  const uniqueInvoices = Array.from(uniqueInvoicesMap.values())

  // Map dunning stage info
  const invoicesWithDunning = uniqueInvoices.map((inv) => {
    const logs = companyDunningLogs.filter((log) => log.invoiceId === inv.id)
    const raw = inv.rawPayload as { orderNumber?: unknown, name?: unknown } | null
    const displayOrderNumber = String(raw?.name || raw?.orderNumber || inv.marketplaceOrderId || '')
    
    return {
      ...inv,
      displayOrderNumber,
      lastDunningStage: logs[0]?.stage || null,
      lastDunningSentAt: logs[0]?.sentAt || null,
    }
  })

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rechnungen</h1>
          <p className="text-slate-500">Übersicht aller generierten Rechnungen und Gutschriften.</p>
        </div>
        <div className="flex gap-3">
          <Link 
            href="/invoices/new"
            className="inline-flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
          >
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Neue Rechnung
          </Link>
          <DraftsDropdown initialDrafts={drafts} />
          <GenerateMissingButton />
        </div>
      </div>

      <InvoiceList 
        initialInvoices={invoicesWithDunning} 
        hasKauflandIntegration={hasKauflandIntegration}
        hasEbayIntegration={hasEbayIntegration}
        hasOttoIntegration={hasOttoIntegration}
        hasAboutYouIntegration={hasAboutYouIntegration}
        hasDecathlonIntegration={hasDecathlonIntegration}
        hasDecathlonEuIntegration={hasDecathlonEuIntegration}
        hasMediamarktIntegration={hasMediamarktIntegration}
        hasAmazonIntegration={hasAmazonIntegration}
        hasShopifyIntegration={hasShopifyIntegration}
        customMiraklIntegrations={customMiraklIntegrations}
        company={company ? { email: company.email, smtpSettings: company.smtpSettings } : undefined}
        initialEmailTemplate={emailTemplate}
        currentUserName={currentUser?.name || ''}
      />
    </div>
  )
}

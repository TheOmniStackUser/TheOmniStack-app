import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { invoices } from '@/db/schema/invoices'
import { orders } from '@/db/schema/orders'
import { eq, desc, and, ne } from 'drizzle-orm'
import Link from 'next/link'
import { InvoiceList } from './invoice-list'
import { GenerateMissingButton } from './generate-missing-button'
import { DraftsDropdown } from './drafts-dropdown'
import { getDraftsAction } from '@/app/actions/manual-invoice'

export default async function InvoicesPage() {
  const auth = await requireAuth()
  const drafts = await getDraftsAction()

  const allInvoices = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      recipientName: invoices.recipientName,
      recipientCountry: invoices.recipientCountry,
      totalAmount: invoices.totalAmount,
      currency: invoices.currency,
      createdAt: invoices.createdAt,
      pdfStorageKey: invoices.pdfStorageKey,
      marketplace: orders.marketplace,
    })
    .from(invoices)
    .leftJoin(orders, eq(invoices.id, orders.invoiceId))
    .where(and(
      eq(invoices.companyId, auth.activeCompanyId),
      ne(invoices.documentType, 'quote')
    ))
    .orderBy(desc(invoices.createdAt))

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

      <InvoiceList initialInvoices={allInvoices} />
    </div>
  )
}

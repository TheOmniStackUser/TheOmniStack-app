import { requireAuth } from '@/lib/session'
import Link from 'next/link'
import { getQuotesAction } from '@/app/actions/manual-invoice'
import { QuoteList } from './quote-list'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { invoiceTextTemplates } from '@/db/schema/templates'
import { users } from '@/db/schema/auth'
import { eq, and } from 'drizzle-orm'

export default async function QuotesPage() {
  const auth = await requireAuth()
  const quotes = await getQuotesAction()

  const [company, emailTemplate, currentUser] = await Promise.all([
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
        eq(invoiceTextTemplates.name, 'email_quote_default')
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

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Angebote</h1>
          <p className="text-slate-500 mt-1">
            Erstelle Angebote und wandle sie per Klick in Rechnungen oder Lieferscheine um.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/quotes/new"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:from-amber-600 hover:to-amber-700 transition-all shadow-md hover:shadow-lg"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Neues Angebot
          </Link>
        </div>
      </div>

      {/* Info Banner */}
      <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-amber-800">
          Fertige Angebote können beliebig oft in eine <strong>Rechnung</strong> oder einen <strong>Lieferschein</strong> umgewandelt werden.
          Das ursprüngliche Angebot bleibt dabei immer im System erhalten.
        </p>
      </div>

      <QuoteList 
        initialQuotes={quotes} 
        company={company ? { email: company.email, smtpSettings: company.smtpSettings } : undefined}
        initialEmailTemplate={emailTemplate}
        currentUserName={currentUser?.name || ''}
      />
    </div>
  )
}

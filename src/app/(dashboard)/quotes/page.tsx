import { requireAuth } from '@/lib/session'
import Link from 'next/link'
import { getQuotesAction } from '@/app/actions/manual-invoice'
import { QuoteList } from './quote-list'

export default async function QuotesPage() {
  await requireAuth()
  const quotes = await getQuotesAction()

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

      <QuoteList initialQuotes={quotes} />
    </div>
  )
}

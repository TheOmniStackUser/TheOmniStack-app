'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { getInvoiceDownloadUrl } from '@/app/actions/invoices'
import { convertQuoteAction, deleteQuoteAction } from '@/app/actions/manual-invoice'
import { useRouter } from 'next/navigation'

interface Quote {
  id: string
  invoiceNumber: string
  recipientName: string | null
  recipientCountry: string | null
  totalAmount: string
  currency: string
  createdAt: Date
  pdfStorageKey: string | null
  status: string
  draftName: string | null
}

const formatCountry = (code?: string | null) => {
  if (!code) return 'DE'
  const map: Record<string, string> = {
    'DEU': 'DE', 'AUT': 'AT', 'CHE': 'CH', 'FRA': 'FR',
    'ITA': 'IT', 'ESP': 'ES', 'NLD': 'NL', 'BEL': 'BE',
  }
  return map[code.toUpperCase()] || code.toUpperCase()
}

export function QuoteList({ initialQuotes }: { initialQuotes: Quote[] }) {
  const router = useRouter()
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 4000)
  }

  const handleDownload = async (id: string) => {
    setLoadingId(id)
    try {
      const url = await getInvoiceDownloadUrl(id)
      window.open(url, '_blank')
    } catch {
      showNotification('PDF konnte nicht geladen werden.', 'error')
    }
    setLoadingId(null)
  }

  const handleConvert = async (id: string, targetType: 'invoice' | 'delivery_note') => {
    setConvertingId(id)
    try {
      const result = await convertQuoteAction(id, targetType) as any
      if (result?.error) {
        showNotification(`Fehler: ${result.error}`, 'error')
        setConvertingId(null)
      }
      // If successful, the action redirects, so no cleanup needed
    } catch (error: any) {
      if (error?.digest?.includes('NEXT_REDIRECT')) return
      showNotification('Fehler bei der Konvertierung.', 'error')
      setConvertingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Angebot wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return
    setDeletingId(id)
    try {
      await deleteQuoteAction(id)
      setQuotes(q => q.filter(item => item.id !== id))
      showNotification('Angebot gelöscht.', 'success')
    } catch {
      showNotification('Angebot konnte nicht gelöscht werden.', 'error')
    }
    setDeletingId(null)
  }

  const filtered = quotes.filter(q => {
    const s = search.toLowerCase()
    return (
      q.invoiceNumber.toLowerCase().includes(s) ||
      (q.recipientName || '').toLowerCase().includes(s)
    )
  })

  return (
    <div>
      {/* Notification */}
      {notification && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-4 rounded-xl shadow-xl text-sm font-medium border transition-all ${
          notification.type === 'success'
            ? 'bg-emerald-950/90 border-emerald-700 text-emerald-200'
            : 'bg-rose-950/90 border-rose-700 text-rose-200'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Search */}
      <div className="mb-5">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Angebot suchen…"
          className="w-full max-w-xs px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30 bg-white"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs tracking-wide uppercase">Ang.-Nr.</th>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs tracking-wide uppercase">Empfänger</th>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs tracking-wide uppercase">Land</th>
              <th className="text-right px-5 py-3.5 font-semibold text-slate-600 text-xs tracking-wide uppercase">Betrag</th>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs tracking-wide uppercase">Erstellt</th>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs tracking-wide uppercase">Status</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-slate-400">
                  Keine Angebote gefunden.
                </td>
              </tr>
            ) : (
              filtered.map((quote) => (
                <tr key={quote.id} className="hover:bg-slate-50/60 transition-colors group">
                  <td className="px-5 py-4">
                    <span className="font-mono text-xs font-semibold text-slate-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                      {quote.invoiceNumber}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-medium text-slate-800">{quote.recipientName || '–'}</div>
                    {quote.draftName && (
                      <div className="text-xs text-slate-400 mt-0.5">{quote.draftName}</div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                      {formatCountry(quote.recipientCountry)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="font-semibold text-slate-800">
                      {new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseFloat(quote.totalAmount))} {quote.currency}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {format(new Date(quote.createdAt), 'dd.MM.yyyy', { locale: de })}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      quote.status === 'issued'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {quote.status === 'issued' ? 'Fertig' : 'Entwurf'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* PDF Download */}
                      {quote.pdfStorageKey && (
                        <button
                          onClick={() => handleDownload(quote.id)}
                          disabled={loadingId === quote.id}
                          title="PDF herunterladen"
                          className="p-2 rounded-lg text-slate-400 hover:text-cyan-500 hover:bg-cyan-50 transition-all"
                        >
                          {loadingId === quote.id ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          )}
                        </button>
                      )}

                      {/* Convert to Invoice */}
                      <button
                        onClick={() => handleConvert(quote.id, 'invoice')}
                        disabled={convertingId === quote.id}
                        title="Als Rechnung erstellen"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all disabled:opacity-50"
                      >
                        {convertingId === quote.id ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        )}
                        → Rechnung
                      </button>

                      {/* Convert to Delivery Note */}
                      <button
                        onClick={() => handleConvert(quote.id, 'delivery_note')}
                        disabled={convertingId === quote.id}
                        title="Als Lieferschein erstellen"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all disabled:opacity-50"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        → Lieferschein
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(quote.id)}
                        disabled={deletingId === quote.id}
                        title="Angebot löschen"
                        className="p-2 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

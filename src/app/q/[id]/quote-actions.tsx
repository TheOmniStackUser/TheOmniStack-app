'use client'

import { useState } from 'react'
import { respondToQuoteAction } from '@/app/actions/quotes-public'
import { Check, X, FileText } from 'lucide-react'

export function QuoteActions({ quoteId, pdfUrl }: { quoteId: string, pdfUrl: string | null }) {
  const [isAccepting, setIsAccepting] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAction = async (action: 'accept' | 'reject') => {
    if (action === 'accept') {
      if (!confirm('Möchten Sie dieses Angebot wirklich verbindlich annehmen?')) return
      setIsAccepting(true)
    } else {
      if (!confirm('Möchten Sie dieses Angebot wirklich ablehnen?')) return
      setIsRejecting(true)
    }
    setError(null)
    try {
      await respondToQuoteAction(quoteId, action)
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten.')
    } finally {
      setIsAccepting(false)
      setIsRejecting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 text-sm font-medium">
          {error}
        </div>
      )}
      
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => handleAction('accept')}
          disabled={isAccepting || isRejecting}
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-4 rounded-xl font-bold text-lg shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
        >
          {isAccepting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Check size={20} className="stroke-[3]" />
          )}
          Angebot verbindlich annehmen
        </button>

        <button
          onClick={() => handleAction('reject')}
          disabled={isAccepting || isRejecting}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white hover:bg-rose-50 text-rose-600 border-2 border-rose-100 hover:border-rose-200 px-6 py-4 rounded-xl font-bold text-lg transition-all disabled:opacity-50"
        >
          {isRejecting ? (
            <div className="w-5 h-5 border-2 border-rose-600/30 border-t-rose-600 rounded-full animate-spin" />
          ) : (
            <X size={20} className="stroke-[3]" />
          )}
          Ablehnen
        </button>
      </div>

      {pdfUrl && (
        <a 
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 mt-4 text-slate-500 hover:text-slate-700 font-medium p-2"
        >
          <FileText size={16} />
          Angebot als PDF herunterladen
        </a>
      )}
    </div>
  )
}

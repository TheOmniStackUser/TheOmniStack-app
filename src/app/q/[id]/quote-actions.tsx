'use client'

import { useState } from 'react'
import { respondToQuoteAction } from '@/app/actions/quotes-public'
import { Check, X, FileText } from 'lucide-react'

export function QuoteActions({ quoteId, pdfUrl }: { quoteId: string, pdfUrl: string | null }) {
  const [isAccepting, setIsAccepting] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<'accept' | 'reject' | null>(null)

  const handleAction = async (action: 'accept' | 'reject') => {
    setConfirmAction(null)
    if (action === 'accept') {
      setIsAccepting(true)
    } else {
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
          onClick={() => setConfirmAction('accept')}
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
          onClick={() => setConfirmAction('reject')}
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

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                {confirmAction === 'accept' ? (
                  <Check className="w-6 h-6 text-emerald-600 stroke-[3]" />
                ) : (
                  <X className="w-6 h-6 text-rose-600 stroke-[3]" />
                )}
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {confirmAction === 'accept' ? 'Angebot annehmen' : 'Angebot ablehnen'}
              </h3>
              <p className="text-slate-500 font-medium leading-relaxed">
                {confirmAction === 'accept' 
                  ? 'Möchten Sie dieses Angebot wirklich verbindlich annehmen?' 
                  : 'Möchten Sie dieses Angebot wirklich ablehnen?'}
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all"
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleAction(confirmAction)}
                className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-white transition-all shadow-lg ${
                  confirmAction === 'accept' 
                    ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' 
                    : 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'
                }`}
              >
                {confirmAction === 'accept' ? 'Ja, annehmen' : 'Ja, ablehnen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

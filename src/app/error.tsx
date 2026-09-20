'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCcw } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error)
  }, [error])

  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 max-w-lg w-full text-center shadow-sm">
        <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-rose-600" />
        </div>
        <h2 className="text-2xl font-bold text-rose-900 mb-2">Ein Fehler ist aufgetreten</h2>
        <p className="text-rose-700 mb-6">
          Wir konnten diese Seite leider nicht laden. Bitte versuchen Sie es erneut oder kontaktieren Sie den Support, falls das Problem bestehen bleibt.
        </p>
        {error.message && (
          <div className="bg-white/60 p-4 rounded-xl text-left text-sm text-rose-800 font-mono overflow-auto border border-rose-100 mb-6">
            {error.message}
          </div>
        )}
        <button
          onClick={() => reset()}
          className="inline-flex items-center justify-center gap-2 bg-rose-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-rose-700 transition-colors shadow-sm w-full"
        >
          <RefreshCcw className="w-5 h-5" />
          Seite neu laden
        </button>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { generateMissingInvoicesAction } from '@/app/actions/invoices'
import { useRouter } from 'next/navigation'

export function GenerateMissingButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  const handleClick = async () => {
    if (!confirm('Sollen Rechnungen für alle Bestellungen ohne Rechnung generiert werden?')) return
    try {
      setIsLoading(true)
      setResult(null)
      const res = await generateMissingInvoicesAction()
      setResult(res.message)
      router.refresh()
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {isLoading ? 'Generiert...' : 'Fehlende Rechnungen generieren'}
      </button>
      {result && (
        <p className="text-sm text-slate-600">{result}</p>
      )}
    </div>
  )
}

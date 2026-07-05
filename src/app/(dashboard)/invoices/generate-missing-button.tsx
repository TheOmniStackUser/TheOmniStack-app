'use client'

import { useState } from 'react'
import { generateMissingInvoicesAction } from '@/app/actions/invoices'
import { useRouter } from 'next/navigation'
import { X, RefreshCcw, DownloadCloud, FileText } from 'lucide-react'

export function GenerateMissingButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  const handleStart = async () => {
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
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors shadow-sm"
      >
        <DownloadCloud className="w-4 h-4" />
        Rechnungen abrufen
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => !isLoading && setIsOpen(false)}
          />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-6 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">Rechnungen abrufen / generieren</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Synchronisiere fehlende Rechnungen für alle offenen Bestellungen.
                </p>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                disabled={isLoading}
                className="text-slate-400 hover:text-slate-600 p-2 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="px-6 py-6 bg-slate-50/50">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="mt-1 bg-blue-100 text-blue-600 p-2 rounded-full h-fit">
                    <DownloadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Von Marktplätzen abrufen</h4>
                    <p className="text-sm text-slate-600 mt-0.5">Lädt Rechnungen von Marktplätzen herunter (z.B. Kaufland, Mirakl, Amazon VCS), falls konfiguriert.</p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="mt-1 bg-emerald-100 text-emerald-600 p-2 rounded-full h-fit">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Fehlende generieren</h4>
                    <p className="text-sm text-slate-600 mt-0.5">Erstellt automatisch TheOmniStack-Rechnungen für alle anderen Bestellungen ohne Beleg.</p>
                  </div>
                </div>
              </div>

              {result && (
                <div className="mt-6 p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 text-sm font-medium">
                  {result}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3">
              <button
                onClick={() => setIsOpen(false)}
                disabled={isLoading}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                {result ? 'Schließen' : 'Abbrechen'}
              </button>
              {!result && (
                <button
                  onClick={handleStart}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <RefreshCcw className="w-4 h-4 animate-spin" />
                      Wird ausgeführt...
                    </>
                  ) : (
                    'Jetzt starten'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

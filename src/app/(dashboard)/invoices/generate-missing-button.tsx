'use client'

import { useState } from 'react'
import { generateMissingInvoicesAction } from '@/app/actions/invoices'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, RefreshCcw, DownloadCloud, FileText, Check } from 'lucide-react'

export function GenerateMissingButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ orderId: string, marketplaceOrderId: string, message: string }[]>([])
  
  // Selection state
  const [fetchMarketplace, setFetchMarketplace] = useState(true)
  const [generateLocal, setGenerateLocal] = useState(true)

  const router = useRouter()

  const handleStart = async () => {
    if (!fetchMarketplace && !generateLocal) return

    try {
      setIsLoading(true)
      setResult(null)
      setErrors([])
      const res = await generateMissingInvoicesAction({ fetchMarketplace, generateLocal })
      setResult(res.message)
      if (res.errors) {
        setErrors(res.errors)
      }
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
                  Wähle aus, welche Aktionen durchgeführt werden sollen.
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
              <div className="space-y-3">
                
                {/* Option 1: Marktplätze */}
                <button 
                  onClick={() => !isLoading && setFetchMarketplace(!fetchMarketplace)}
                  disabled={isLoading}
                  className={`w-full text-left flex gap-4 p-4 rounded-2xl border transition-all ${
                    fetchMarketplace ? 'bg-white border-blue-200 shadow-sm ring-1 ring-blue-100' : 'bg-transparent border-slate-200 hover:bg-slate-100/50'
                  }`}
                >
                  <div className={`mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                    fetchMarketplace ? 'bg-blue-600 text-white' : 'border-2 border-slate-300'
                  }`}>
                    {fetchMarketplace && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Von Marktplätzen abrufen</h4>
                    <p className="text-sm text-slate-500 mt-0.5 leading-snug">Lädt Rechnungen von Marktplätzen herunter (z.B. Kaufland, Mirakl, Amazon VCS), falls konfiguriert.</p>
                  </div>
                </button>
                
                {/* Option 2: Lokal */}
                <button 
                  onClick={() => !isLoading && setGenerateLocal(!generateLocal)}
                  disabled={isLoading}
                  className={`w-full text-left flex gap-4 p-4 rounded-2xl border transition-all ${
                    generateLocal ? 'bg-white border-emerald-200 shadow-sm ring-1 ring-emerald-100' : 'bg-transparent border-slate-200 hover:bg-slate-100/50'
                  }`}
                >
                  <div className={`mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                    generateLocal ? 'bg-emerald-600 text-white' : 'border-2 border-slate-300'
                  }`}>
                    {generateLocal && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Fehlende generieren</h4>
                    <p className="text-sm text-slate-500 mt-0.5 leading-snug">Erstellt automatisch TheOmniStack-Rechnungen für alle anderen Bestellungen ohne Beleg.</p>
                  </div>
                </button>
                
              </div>

              {result && (
                <div className={`mt-6 p-4 rounded-xl border text-sm font-medium ${errors.length > 0 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                  {result}
                  {errors.length > 0 && (
                    <div className="mt-4 border-t border-amber-200/50 pt-3">
                      <p className="text-xs font-bold text-amber-900 mb-2">Details zu den Fehlern:</p>
                      <div className="bg-white/60 rounded-lg text-xs font-mono max-h-48 overflow-y-auto divide-y divide-amber-100">
                        {errors.map((err, i) => (
                          <div key={i} className="p-2.5 flex flex-col gap-1 hover:bg-white/80 transition-colors">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-amber-900">{err.marketplaceOrderId || err.orderId}</span>
                              <Link href={`/orders/${err.orderId}`} target="_blank" className="text-blue-600 hover:text-blue-800 hover:underline">
                                Bestellung ansehen &rarr;
                              </Link>
                            </div>
                            <span className="text-slate-600 whitespace-pre-wrap">{err.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
                  disabled={isLoading || (!fetchMarketplace && !generateLocal)}
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

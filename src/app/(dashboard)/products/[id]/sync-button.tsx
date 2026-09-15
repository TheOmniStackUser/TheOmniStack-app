'use client'

import { useState, useTransition } from 'react'
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { triggerProductSync } from './sync-action'

export function SyncButton({ productId, sku, currentStock, price }: { productId: string, sku: string, currentStock: number, price: number }) {
  const [isPending, startTransition] = useTransition()
  const [synced, setSynced] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(current => current?.message === message ? null : current)
    }, 4000)
  }

  const handleSync = () => {
    showToast('Synchronisierung an Marktplätze gestartet...', 'info')
    startTransition(async () => {
      try {
        await triggerProductSync(productId, sku, currentStock, price)
        setSynced(true)
        showToast('Erfolgreich an alle aktiven Marktplätze gesendet!', 'success')
        setTimeout(() => setSynced(false), 3000)
      } catch (error) {
        console.error('Failed to sync:', error)
        showToast('Fehler bei der Synchronisierung. Bitte Logs prüfen.', 'error')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={handleSync}
        disabled={isPending}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all duration-300 disabled:opacity-50"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin text-cyan-600" /> : <RefreshCw className={`w-4 h-4 ${synced ? 'text-emerald-500' : 'text-slate-500'}`} />}
        {synced ? 'Erfolgreich' : (isPending ? 'Wird synchronisiert...' : 'Live-Sync')}
      </button>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] px-5 py-3.5 rounded-2xl shadow-xl transition-all animate-in slide-in-from-bottom-8 flex items-center gap-3 ${
          toast.type === 'error' ? 'bg-rose-500 text-white' : 
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 
          'bg-slate-800 text-white'
        }`}>
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-100" />}
          {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-100" />}
          {toast.type === 'info' && <Info className="w-5 h-5 text-slate-300 animate-pulse" />}
          <span className="font-semibold text-sm">{toast.message}</span>
        </div>
      )}
    </>
  )
}

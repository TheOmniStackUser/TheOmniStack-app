'use client'

import { useState } from 'react'
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { triggerGlobalMarketplaceSync } from '@/app/actions/products'

export function ManualSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [modalState, setModalState] = useState<{ isOpen: boolean; type: 'success' | 'error'; message: string }>({
    isOpen: false,
    type: 'success',
    message: ''
  })

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await triggerGlobalMarketplaceSync()
      setModalState({
        isOpen: true,
        type: 'success',
        message: 'Der Live-Sync wurde für alle aktiven Produkte erfolgreich angestoßen!'
      })
    } catch (error: any) {
      console.error(error)
      setModalState({
        isOpen: true,
        type: 'error',
        message: `Fehler beim Sync: ${error.message || 'Unbekannter Fehler'}`
      })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <>
      <button
        onClick={handleSync}
        disabled={isSyncing}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 transition-colors border border-indigo-200 shadow-sm disabled:opacity-50"
      >
        {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        Globaler Live-Sync
      </button>

      {modalState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full mb-4 ${modalState.type === 'success' ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                {modalState.type === 'success' ? (
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-7 w-7 text-rose-600" />
                )}
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                {modalState.type === 'success' ? 'Sync gestartet' : 'Fehler aufgetreten'}
              </h3>
              <p className="text-slate-500 text-sm">
                {modalState.message}
              </p>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-center">
              <button
                onClick={() => setModalState({ ...modalState, isOpen: false })}
                className="w-full inline-flex justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
              >
                Verstanden
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export function ManualSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [progressData, setProgressData] = useState<any>(null)
  
  const [modalState, setModalState] = useState<{ isOpen: boolean; type: 'success' | 'error' | 'syncing'; message: string }>({
    isOpen: false,
    type: 'success',
    message: ''
  })

  const handleSync = async () => {
    setIsSyncing(true)
    setProgressData(null)
    try {
      const res = await fetch('/api/v1/products/sync', { method: 'POST' })
      const result = await res.json()
      
      if (!res.ok) {
        throw new Error(result.error || 'Fehler beim Abruf')
      }
      
      if (result.jobId) {
        setJobId(result.jobId)
        setModalState({
          isOpen: true,
          type: 'syncing',
          message: 'Der Sync wird im Hintergrund ausgeführt. Sie können dieses Fenster schließen.'
        })
      } else {
        setModalState({
          isOpen: true,
          type: 'success',
          message: result.message || 'Sync wurde im Hintergrund gestartet.'
        })
        setIsSyncing(false)
      }
    } catch (error: any) {
      console.error(error)
      setModalState({
        isOpen: true,
        type: 'error',
        message: `Fehler beim Sync: ${error.message || 'Unbekannter Fehler'}`
      })
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (jobId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/v1/products/sync/status?jobId=${jobId}`)
          if (!res.ok) return
          const data = await res.json()
          
          if (data.state === 'completed' || data.state === 'failed') {
             setJobId(null)
             setIsSyncing(false)
             if (data.state === 'completed') {
               const updatesSent = data.result?.totalUpdatesSent || data.progress?.totalUpdatesSent || 0
               setModalState(prev => {
                 // Only update modal if it's currently open or if we want to force open it.
                 // We will force open it to notify the user.
                 return {
                   isOpen: true,
                   type: 'success',
                   message: `Sync abgeschlossen. Es wurden ${updatesSent} Produktupdates erfolgreich an die Marktplätze gesendet.`
                 }
               })
             } else {
               setModalState({
                 isOpen: true,
                 type: 'error',
                 message: 'Der Sync ist fehlgeschlagen.'
               })
             }
          } else {
             setProgressData(data.progress)
          }
        } catch (e) {
          console.error("Status poll error", e)
        }
      }, 1500)
    }
    return () => clearInterval(interval)
  }, [jobId])

  const calculateProgressPercent = () => {
    if (!progressData) return 0
    if (progressData.step === 'pushing' && progressData.totalIntegrations > 0) {
      return Math.round((progressData.integrationIndex / progressData.totalIntegrations) * 100)
    }
    return 0
  }

  return (
    <>
      <button
        onClick={handleSync}
        disabled={isSyncing}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 transition-colors border border-indigo-200 shadow-sm disabled:opacity-50"
      >
        {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {isSyncing ? 'Sync läuft...' : 'Globaler Live-Sync'}
      </button>

      {modalState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full mb-4 ${modalState.type === 'success' ? 'bg-emerald-100' : modalState.type === 'error' ? 'bg-rose-100' : 'bg-indigo-100'}`}>
                {modalState.type === 'success' && <CheckCircle2 className="h-7 w-7 text-emerald-600" />}
                {modalState.type === 'error' && <AlertCircle className="h-7 w-7 text-rose-600" />}
                {modalState.type === 'syncing' && <Loader2 className="h-7 w-7 text-indigo-600 animate-spin" />}
              </div>
              
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                {modalState.type === 'success' ? 'Sync abgeschlossen' : 
                 modalState.type === 'error' ? 'Fehler aufgetreten' : 
                 'Sync läuft'}
              </h3>
              
              <p className="text-slate-500 text-sm mb-4">
                {modalState.message}
              </p>

              {modalState.type === 'syncing' && (
                <div className="mt-4 text-left">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>
                      {progressData?.step === 'pushing' ? `Aktualisiere ${progressData.marketplace}...` : 'Bereite vor...'}
                    </span>
                    <span className="font-medium text-slate-700">{calculateProgressPercent()}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden relative">
                    <div 
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-500 ease-out" 
                      style={{ width: `${calculateProgressPercent()}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-slate-50 px-6 py-4 flex justify-center">
              <button
                onClick={() => {
                  if (modalState.type !== 'syncing') {
                    setModalState({ ...modalState, isOpen: false })
                  } else {
                    // Just hide modal, sync continues in background
                    setModalState({ ...modalState, isOpen: false })
                  }
                }}
                className="w-full inline-flex justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
              >
                {modalState.type === 'syncing' ? 'Im Hintergrund ausführen' : 'Verstanden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

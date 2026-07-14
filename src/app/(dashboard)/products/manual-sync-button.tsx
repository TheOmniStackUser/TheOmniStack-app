'use client'

import { useState } from 'react'
import { RefreshCw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export function ManualSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [progressData, setProgressData] = useState<{ step: string; current: number; total: number; marketplace: string; updatesCount: number } | null>(null)
  
  const [modalState, setModalState] = useState<{ isOpen: boolean; type: 'success' | 'error' | 'syncing'; message: string }>({
    isOpen: false,
    type: 'success',
    message: ''
  })

  const handleSync = async () => {
    setIsSyncing(true)
    setProgressData(null)
    setModalState({
      isOpen: true,
      type: 'syncing',
      message: 'Der Sync wird vorbereitet...'
    })

    try {
      // Step 1: Get plan (active integrations)
      const planRes = await fetch('/api/v1/products/sync/plan')
      const plan = await planRes.json()
      
      if (!planRes.ok) throw new Error(plan.error || 'Fehler beim Abruf des Sync-Plans')
      
      const integrations = plan.integrations || []
      const totalProducts = plan.totalProducts || 0

      if (integrations.length === 0) {
        setModalState({
          isOpen: true,
          type: 'success',
          message: 'Keine aktiven Marktplätze für den Push-Sync gefunden.'
        })
        setIsSyncing(false)
        return
      }

      // Step 2: Execute sync sequentially
      let updatesSent = 0
      
      for (let i = 0; i < integrations.length; i++) {
        const integration = integrations[i]
        
        setProgressData({
          step: 'pushing',
          current: i,
          total: integrations.length,
          marketplace: integration.displayName,
          updatesCount: totalProducts
        })

        const execRes = await fetch(`/api/v1/products/sync/execute?integrationId=${integration.id}`, { method: 'POST' })
        const execData = await execRes.json()
        
        if (!execRes.ok) {
          console.error(`Fehler bei ${integration.displayName}:`, execData.error)
          // We continue with other integrations even if one fails
        } else {
          updatesSent = execData.updatesCount || updatesSent
        }
      }

      // Final success
      setProgressData({
        step: 'completed',
        current: integrations.length,
        total: integrations.length,
        marketplace: '',
        updatesCount: updatesSent
      })

      setModalState({
        isOpen: true,
        type: 'success',
        message: `Sync abgeschlossen. Es wurden ${updatesSent} Produktupdates erfolgreich an die Marktplätze gesendet.`
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

  const calculateProgressPercent = () => {
    if (!progressData || progressData.total === 0) return 0
    return Math.round((progressData.current / progressData.total) * 100)
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

              {modalState.type === 'syncing' && progressData && (
                <div className="mt-4 text-left">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>
                      {progressData.step === 'pushing' ? `Aktualisiere ${progressData.marketplace}...` : 'Bereite vor...'}
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

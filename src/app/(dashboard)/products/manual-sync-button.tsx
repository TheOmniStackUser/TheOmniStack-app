'use client'

import { useState } from 'react'
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'

export function ManualSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [plan, setPlan] = useState<{ integrations: any[], totalProducts: number } | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isFetchingPlan, setIsFetchingPlan] = useState(false)
  
  const [modalState, setModalState] = useState<{ 
    isOpen: boolean; 
    type: 'select' | 'success' | 'error' | 'syncing'; 
    message: string;
  }>({
    isOpen: false,
    type: 'select',
    message: ''
  })

  const handleOpenSelection = async () => {
    setIsFetchingPlan(true)
    setModalState({ isOpen: true, type: 'syncing', message: 'Lade aktive Marktplätze...' })
    try {
      const planRes = await fetch('/api/v1/products/sync/plan')
      const planData = await planRes.json()
      
      if (!planRes.ok) throw new Error(planData.error || 'Fehler beim Abruf des Sync-Plans')
      
      const integrations = planData.integrations || []
      
      if (integrations.length === 0) {
        setModalState({
          isOpen: true,
          type: 'success',
          message: 'Keine aktiven Marktplätze für den Push-Sync gefunden.'
        })
        return
      }

      setPlan(planData)
      setSelectedIds(integrations.map((i: any) => i.id)) // Select all by default
      setModalState({ isOpen: true, type: 'select', message: '' })
    } catch (error: any) {
      console.error(error)
      setModalState({ isOpen: true, type: 'error', message: error.message || 'Unbekannter Fehler' })
    } finally {
      setIsFetchingPlan(false)
    }
  }

  const handleStartSync = async () => {
    if (!plan || selectedIds.length === 0) return
    
    setIsSyncing(true)
    setModalState({ isOpen: true, type: 'syncing', message: 'Starte Sync im Hintergrund...' })

    try {
      const integrationsToSync = plan.integrations.filter(i => selectedIds.includes(i.id))
      
      let totalUpdatesSent = 0
      for (const integration of integrationsToSync) {
        const execRes = await fetch(`/api/v1/products/sync/execute?integrationId=${integration.id}`, { method: 'POST' })
        const execData = await execRes.json()
        if (execRes.ok) {
          totalUpdatesSent += execData.updatesCount || 0
        }
      }

      setModalState({
        isOpen: true,
        type: 'success',
        message: `Sync wurde im Hintergrund gestartet. Dies kann je nach Menge der Produkte einige Minuten dauern.`
      })

    } catch (error: any) {
      console.error(error)
      setModalState({
        isOpen: true,
        type: 'error',
        message: `Fehler beim Starten des Syncs: ${error.message || 'Unbekannter Fehler'}`
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const toggleSelectAll = () => {
    if (!plan) return
    if (selectedIds.length === plan.integrations.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(plan.integrations.map(i => i.id))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <>
      <button
        onClick={handleOpenSelection}
        disabled={isFetchingPlan || isSyncing}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 transition-colors border border-indigo-200 shadow-sm disabled:opacity-50"
      >
        {(isFetchingPlan || isSyncing) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {(isFetchingPlan || isSyncing) ? 'Lade...' : 'Globaler Live-Sync'}
      </button>

      {modalState.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200 relative overflow-hidden max-h-[90vh]">
            
            {modalState.type === 'select' && plan ? (
              <>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                  <h3 className="font-bold text-slate-900 text-lg">Marktplätze für Sync auswählen</h3>
                  <button onClick={() => setModalState({ ...modalState, isOpen: false })} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar shrink">
                  <p className="text-sm text-slate-500 mb-4">Bitte wähle die Marktplätze aus, an die du Bestand und Preise (falls konfiguriert) live senden möchtest.</p>
                  
                  <div className="space-y-2">
                    <div 
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-all"
                      onClick={toggleSelectAll}
                    >
                      <input 
                        type="checkbox"
                        checked={selectedIds.length === plan.integrations.length && plan.integrations.length > 0}
                        onChange={toggleSelectAll}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                      />
                      <span className="font-semibold text-slate-900">Alle Marktplätze</span>
                    </div>
                    <div className="h-px bg-slate-100 my-2"></div>
                    {plan.integrations.map(integration => (
                      <div 
                        key={integration.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-all ml-4"
                        onClick={() => toggleSelect(integration.id)}
                      >
                        <input 
                          type="checkbox"
                          checked={selectedIds.includes(integration.id)}
                          onChange={() => toggleSelect(integration.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                        />
                        <span className="text-slate-700">{integration.displayName}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button
                    onClick={() => setModalState({ ...modalState, isOpen: false })}
                    className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleStartSync}
                    disabled={selectedIds.length === 0 || isSyncing}
                    className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Sync starten
                  </button>
                </div>
              </>
            ) : (
              <div className="p-6 text-center">
                <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full mb-4 ${modalState.type === 'success' ? 'bg-emerald-100' : modalState.type === 'error' ? 'bg-rose-100' : 'bg-indigo-100'}`}>
                  {modalState.type === 'success' && <CheckCircle2 className="h-7 w-7 text-emerald-600" />}
                  {modalState.type === 'error' && <AlertCircle className="h-7 w-7 text-rose-600" />}
                  {modalState.type === 'syncing' && <Loader2 className="h-7 w-7 text-indigo-600 animate-spin" />}
                </div>
                
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  {modalState.type === 'success' ? 'Erfolg' : 
                   modalState.type === 'error' ? 'Fehler aufgetreten' : 
                   'Bitte warten'}
                </h3>
                
                <p className="text-slate-500 text-sm mb-6">
                  {modalState.message}
                </p>
                
                {modalState.type !== 'syncing' && (
                  <button
                    onClick={() => setModalState({ ...modalState, isOpen: false })}
                    className="w-full inline-flex justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
                  >
                    OK
                  </button>
                )}
              </div>
            )}
            
          </div>
        </div>
      )}
    </>
  )
}

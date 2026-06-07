'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { triggerManualSyncAction, getActiveIntegrationsList } from '@/app/actions/sync'
import { AlertCircle, CheckCircle2, X, Loader2 } from 'lucide-react'

export function SyncButton() {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; label: string; simulatedProgress: number } | null>(null)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type })
    // Keep success messages longer so they can be read
    setTimeout(() => setNotification(null), 8000)
  }

  // Simulate progress
  useEffect(() => {
    if (isPending && syncProgress && syncProgress.current < syncProgress.total) {
      const timer = setInterval(() => {
        setSyncProgress(prev => {
          if (!prev) return prev;
          const diff = 90 - prev.simulatedProgress;
          const increment = Math.max(0.5, diff * 0.1);
          return { ...prev, simulatedProgress: Math.min(90, prev.simulatedProgress + increment) };
        });
      }, 500);
      return () => clearInterval(timer);
    }
  }, [isPending, syncProgress?.current, syncProgress?.total]);

  const handleSync = async () => {
    setIsPending(true)
    setNotification(null)

    try {
      const integrations = await getActiveIntegrationsList()
      
      if (integrations.length === 0) {
        showNotification('Es sind keine aktiven Marktplätze verknüpft.', 'error')
        setIsPending(false)
        return
      }

      setSyncProgress({ current: 0, total: integrations.length, label: integrations[0].label, simulatedProgress: 0 })

      let totalAffected = 0
      let hasError = false

      for (let i = 0; i < integrations.length; i++) {
        const currentMarketplace = integrations[i]
        setSyncProgress({ current: i, total: integrations.length, label: currentMarketplace.label, simulatedProgress: 0 })
        
        const result = await triggerManualSyncAction({ marketplace: currentMarketplace.value })
        
        if (result?.error) {
          hasError = true
          showNotification(result.error, 'error')
          break
        }

        if (result?.affected !== undefined) {
          totalAffected += result.affected
        }
      }

      if (!hasError) {
        setSyncProgress({ current: integrations.length, total: integrations.length, label: 'Abgeschlossen', simulatedProgress: 100 })
        showNotification(totalAffected > 0 
          ? `Import erfolgreich! ${totalAffected} neue Bestellung(en) wurden hinzugefügt.` 
          : 'Import abgeschlossen! Es wurden keine neuen Bestellungen gefunden.', 'success')
        router.refresh()
      }
    } catch (e) {
      showNotification('Ein unerwarteter Fehler ist beim Import aufgetreten.', 'error')
    } finally {
      setIsPending(false)
      setTimeout(() => setSyncProgress(null), 3000)
    }
  }

  return (
    <div className="relative inline-block">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-6 right-6 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`flex items-start gap-3 p-4 rounded-2xl shadow-2xl border max-w-sm ${
            notification.type === 'success' 
              ? 'bg-white border-emerald-100 text-emerald-900' 
              : 'bg-white border-red-100 text-red-900'
          }`}>
            <div className={`p-2 rounded-xl mt-0.5 ${
              notification.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
            }`}>
              {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            </div>
            <div className="flex-1 pr-2">
              <p className="text-sm font-bold">Import Status</p>
              <p className="text-xs leading-relaxed opacity-80">{notification.message}</p>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="p-1 hover:bg-slate-50 rounded-lg transition-colors text-slate-400"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={handleSync}
        disabled={isPending}
        className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-slate-200 text-sm font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 group"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-white" />
            <span>Importiere Bestellungen...</span>
          </>
        ) : (
          <>
            <svg 
              className="group-hover:rotate-180 transition-transform duration-500"
              xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 21v-5h5"/>
            </svg>
            Bestellungen importieren
          </>
        )}
      </button>

      {/* Dropdown Progress UI */}
      {syncProgress && (
        <div className="absolute top-full right-0 mt-3 w-72 animate-in fade-in slide-in-from-top-2 duration-300 bg-white p-4 rounded-xl shadow-xl border border-slate-200 z-[90]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-slate-800">
              {syncProgress.current < syncProgress.total ? `Importiere ${syncProgress.label}...` : 'Import abgeschlossen'}
            </span>
            <span className="text-sm font-bold text-slate-900">
              {syncProgress.current < syncProgress.total 
                ? Math.min(99, Math.round(((syncProgress.current / syncProgress.total) * 100) + ((syncProgress.simulatedProgress / 100) * (100 / syncProgress.total))))
                : 100}%
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-slate-900 h-2 rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${syncProgress.current < syncProgress.total 
                ? Math.min(99, Math.round(((syncProgress.current / syncProgress.total) * 100) + ((syncProgress.simulatedProgress / 100) * (100 / syncProgress.total))))
                : 100}%` }}
            ></div>
          </div>
          <div className="mt-2 text-xs text-slate-500 text-right">
            Marktplatz {Math.min(syncProgress.current + 1, syncProgress.total)} von {syncProgress.total}
          </div>
        </div>
      )}
    </div>
  )
}

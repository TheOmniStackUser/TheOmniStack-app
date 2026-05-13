'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { triggerManualSyncAction } from '@/app/actions/sync'
import { AlertCircle, CheckCircle2, X, Loader2 } from 'lucide-react'

export function SyncButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type })
    // Keep success messages longer so they can be read
    setTimeout(() => setNotification(null), 8000)
  }

  const handleSync = () => {
    startTransition(async () => {
      try {
        // We use triggerManualSyncAction instead of triggerSyncAction 
        // to get immediate feedback and wait for the results.
        const result = await triggerManualSyncAction({ marketplace: 'all' })
        
        if (result?.error) {
          showNotification(result.error, 'error')
        } else {
          showNotification(result?.message || 'Import erfolgreich abgeschlossen.', 'success')
          router.refresh()
        }
      } catch (e) {
        showNotification('Ein unerwarteter Fehler ist beim Import aufgetreten.', 'error')
      }
    })
  }

  return (
    <>
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
    </>
  )
}

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { triggerSyncAction } from '@/app/actions/sync'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

export function SyncButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 5000)
  }

  return (
    <>
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-6 right-6 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`flex items-center gap-3 p-4 rounded-2xl shadow-2xl border ${
            notification.type === 'success' 
              ? 'bg-white border-emerald-100 text-emerald-900' 
              : 'bg-white border-red-100 text-red-900'
          }`}>
            <div className={`p-2 rounded-xl ${
              notification.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
            }`}>
              {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            </div>
            <div className="pr-4">
              <p className="text-sm font-bold">Benachrichtigung</p>
              <p className="text-xs opacity-70">{notification.message}</p>
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
        onClick={() => startTransition(async () => {
          const result = await triggerSyncAction()
          if (result?.error) {
            showNotification(result.error, 'error')
          } else {
            showNotification(result?.message || 'Sync erfolgreich gestartet', 'success')
            // Sync is running in background. Let's refresh the UI a few times automatically
            setTimeout(() => router.refresh(), 2000)
            setTimeout(() => router.refresh(), 5000)
          }
        })}
        disabled={isPending}
        className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-slate-200 text-sm font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
      >
        {isPending ? (
          <>
            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Importiere...
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

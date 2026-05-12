'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { triggerSyncAction } from '@/app/actions/sync'

export function SyncButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(async () => {
        const result = await triggerSyncAction()
        if (result?.error) {
          alert(result.error)
        } else {
          // Sync is running in background. Let's refresh the UI a few times automatically
          // so the user doesn't have to manually reload to see new orders.
          setTimeout(() => router.refresh(), 2000)
          setTimeout(() => router.refresh(), 5000)
          setTimeout(() => router.refresh(), 8000)
          alert(result?.message)
        }
      })}
      disabled={isPending}
      className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg shadow-sm text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
    >
      {isPending ? (
        <>
          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Startet...
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
            <path d="M16 21v-5h5"/>
          </svg>
          Bestellungen importieren
        </>
      )}
    </button>
  )
}

'use client'

import { useState } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { triggerGlobalMarketplaceSync } from '@/app/actions/products'

export function ManualSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await triggerGlobalMarketplaceSync()
      alert('Der Live-Sync wurde für alle aktiven Produkte angestoßen!')
    } catch (error: any) {
      console.error(error)
      alert(`Fehler beim Sync: ${error.message || 'Unbekannter Fehler'}`)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 transition-colors border border-indigo-200 shadow-sm disabled:opacity-50"
    >
      {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
      Globaler Live-Sync
    </button>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { triggerProductSync } from './sync-action'

export function SyncButton({ productId, sku, currentStock, price }: { productId: string, sku: string, currentStock: number, price: number }) {
  const [isPending, startTransition] = useTransition()
  const [synced, setSynced] = useState(false)

  const handleSync = () => {
    startTransition(async () => {
      try {
        await triggerProductSync(productId, sku, currentStock, price)
        setSynced(true)
        setTimeout(() => setSynced(false), 2000)
      } catch (error) {
        console.error('Failed to sync:', error)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={isPending}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all duration-300 disabled:opacity-50"
    >
      {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className={`w-4 h-4 ${synced ? 'text-green-500' : ''}`} />}
      {synced ? 'Synchronisiert' : (isPending ? 'Sync...' : 'Sync')}
    </button>
  )
}

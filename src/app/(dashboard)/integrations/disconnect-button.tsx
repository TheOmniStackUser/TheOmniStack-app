'use client'

import { useTransition, useState } from 'react'
import { disconnectIntegrationAction } from '@/app/actions/integrations'
import { AlertTriangle } from 'lucide-react'

export function DisconnectButton({ type, id }: { type: string, id?: string }) {
  const [isPending, startTransition] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2 bg-red-50 p-2 rounded-xl border border-red-200">
        <AlertTriangle className="text-red-500 w-5 h-5 ml-2" />
        <span className="text-sm font-medium text-red-700">Wirklich trennen?</span>
        <div className="flex gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={isPending}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 bg-white border border-gray-300 rounded-lg shadow-sm"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                await disconnectIntegrationAction(type, id)
                setShowConfirm(false)
              })
            }}
            className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm"
          >
            {isPending ? '...' : 'Ja, trennen'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => setShowConfirm(true)}
      className="w-full sm:w-auto px-6 py-2.5 border border-red-200 rounded-xl shadow-sm text-sm font-bold text-red-600 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all active:scale-95 disabled:opacity-50"
    >
      Verbindung trennen
    </button>
  )
}

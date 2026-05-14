'use client'

import { extendTrialAction } from '@/app/actions/admin'
import { useState } from 'react'

export function TrialManager({ companyId, currentExpiry }: { companyId: string, currentExpiry: Date | null }) {
  const [loading, setLoading] = useState(false)

  const handleExtend = async (days: number) => {
    if (!confirm(`Möchtest du den Testzeitraum wirklich um ${days} Tage verlängern?`)) return
    setLoading(true)
    try {
      await extendTrialAction(companyId, days)
    } catch (e) {
      alert('Fehler beim Verlängern des Testzeitraums.')
    } finally {
      setLoading(false)
    }
  }

  const daysLeft = currentExpiry ? Math.ceil((new Date(currentExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <p className="text-xs text-white/30 mb-1">Testphase</p>
      <div className="flex items-center justify-between">
        <p className={`text-2xl font-bold ${daysLeft > 0 ? 'text-blue-400' : 'text-white/40'}`}>
          {daysLeft > 0 ? `${daysLeft} Tage` : 'Abgelaufen'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => handleExtend(7)}
            disabled={loading}
            className="text-[10px] px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
          >
            +7 Tage
          </button>
          <button
            onClick={() => handleExtend(14)}
            disabled={loading}
            className="text-[10px] px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
          >
            +14 Tage
          </button>
        </div>
      </div>
      {currentExpiry && (
        <p className="text-[10px] text-white/20 mt-2 italic">
          Läuft ab am {new Date(currentExpiry).toLocaleDateString('de-DE')}
        </p>
      )}
    </div>
  )
}

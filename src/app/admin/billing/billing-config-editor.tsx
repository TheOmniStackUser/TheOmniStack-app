'use client'

import { useState } from 'react'
import { saveBillingConfigAction } from '@/app/actions/system-settings'

export function BillingConfigEditor({ initialConfig }: { initialConfig: any }) {
  const [config, setConfig] = useState(initialConfig)
  const [isSaving, setIsSaving] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await saveBillingConfigAction(config)
      alert('Konfiguration gespeichert!')
      setIsOpen(false)
    } catch (error) {
      alert('Fehler beim Speichern')
    } finally {
      setIsSaving(false)
    }
  }

  const updateTier = (index: number, field: string, value: string) => {
    const newTiers = [...config.tiers]
    const numValue = value === '' ? 0 : parseFloat(value.replace(',', '.'))
    newTiers[index] = { ...newTiers[index], [field]: numValue }
    setConfig({ ...config, tiers: newTiers })
  }

  return (
    <div className="mb-8">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/10 transition-all text-sm font-bold flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Preise konfigurieren
      </button>

      {isOpen && (
        <div className="mt-4 p-6 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl">
          <h2 className="text-lg font-bold text-white mb-6">Abrechnungskonfiguration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-4">
              <label className="block text-sm font-bold text-white/60">Mindestpreis pro Monat (€)</label>
              <input 
                type="number" 
                step="0.01"
                value={config.minPrice}
                onChange={(e) => setConfig({ ...config, minPrice: parseFloat(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-bold text-white/60 mb-4">Preisstaffelung</label>
            <div className="grid grid-cols-3 gap-4 text-xs font-bold text-white/30 uppercase tracking-wider px-4">
              <div>Bis Bestellungen</div>
              <div>Preis pro Bestellung (€)</div>
              <div></div>
            </div>
            {config.tiers.map((tier: any, index: number) => (
              <div key={index} className="grid grid-cols-3 gap-4 items-center">
                <input 
                  type="text"
                  value={tier.upTo === Infinity ? 'Unbegrenzt' : tier.upTo}
                  disabled={tier.upTo === Infinity}
                  onChange={(e) => updateTier(index, 'upTo', e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
                />
                <input 
                  type="text"
                  value={tier.pricePerOrder}
                  onChange={(e) => updateTier(index, 'pricePerOrder', e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:ring-2 focus:ring-violet-500"
                />
                {tier.upTo !== Infinity && (
                  <button 
                    onClick={() => {
                      const newTiers = config.tiers.filter((_: any, i: number) => i !== index)
                      setConfig({ ...config, tiers: newTiers })
                    }}
                    className="text-red-400 hover:text-red-300 text-xs font-bold"
                  >
                    Entfernen
                  </button>
                )}
              </div>
            ))}
            <button 
              onClick={() => {
                const newTiers = [...config.tiers]
                const lastInfinity = newTiers.pop()
                newTiers.push({ upTo: 0, pricePerOrder: 0 })
                newTiers.push(lastInfinity)
                setConfig({ ...config, tiers: newTiers })
              }}
              className="text-violet-400 hover:text-violet-300 text-sm font-bold"
            >
              + Stufe hinzufügen
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 flex justify-end gap-4">
            <button onClick={() => setIsOpen(false)} className="px-6 py-2 text-white/60 font-bold hover:text-white transition-colors">Abbrechen</button>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl shadow-lg shadow-violet-500/20 disabled:opacity-50"
            >
              {isSaving ? 'Speichert...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

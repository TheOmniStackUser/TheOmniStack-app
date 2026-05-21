'use client'

import { useActionState, useState } from 'react'
import { saveSyncSettingsAction } from '@/app/actions/integrations'
import { HelpCircle, Clock, CheckCircle } from 'lucide-react'

type MarketplaceOption = {
  value: string
  label: string
}

type SyncSettingsFormProps = {
  company: {
    fetchOrdersDaily: boolean
    fetchOrdersTime: string
    fetchOrdersMarketplaces: string[]
  }
  activeMarketplaces: MarketplaceOption[]
}

export function SyncSettingsForm({ company, activeMarketplaces }: SyncSettingsFormProps) {
  const [state, action, pending] = useActionState(saveSyncSettingsAction, undefined)
  const [isEnabled, setIsEnabled] = useState(company.fetchOrdersDaily)
  const [selectedMarketplaces, setSelectedMarketplaces] = useState<string[]>(
    company.fetchOrdersMarketplaces || []
  )

  const handleToggleMarketplace = (value: string) => {
    setSelectedMarketplaces((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    )
  }

  return (
    <form action={action} className="space-y-6 max-w-xl">
      {state?.success && (
        <div className="p-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
          <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-600" />
          <span>{state.message}</span>
        </div>
      )}

      {state?.errors && !state.success && (
        <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl animate-in fade-in slide-in-from-top-1">
          Bitte überprüfe deine Eingaben.
        </div>
      )}

      {/* Daily Sync Activation Toggle */}
      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-150 shadow-sm transition-all hover:shadow-md">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">Täglichen Bestellabruf aktivieren</span>
            <div className="group relative">
              <HelpCircle size={14} className="text-gray-400 cursor-help hover:text-blue-500 transition-colors" />
              <div className="absolute left-6 top-0 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 transform -translate-y-1/4">
                <p className="leading-relaxed text-slate-300">
                  Wenn aktiviert, ruft theomnistack einmal täglich automatisch neue, unversandte Bestellungen von den ausgewählten Marktplätzen ab.
                </p>
                <div className="absolute left-0 top-3 -translate-x-full border-8 border-transparent border-r-slate-900"></div>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Automatischer Import deiner Bestellungen im Hintergrund.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer select-none">
          <input
            type="checkbox"
            name="fetchOrdersDaily"
            value="true"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {isEnabled && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
          {/* Time Picker */}
          <div className="space-y-2">
            <label htmlFor="fetchOrdersTime" className="block text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-gray-400" />
              Abruf-Uhrzeit (täglich)
            </label>
            <input
              id="fetchOrdersTime"
              name="fetchOrdersTime"
              type="time"
              defaultValue={company.fetchOrdersTime || '03:00'}
              required
              className="block w-full max-w-[150px] px-4 py-2.5 border border-gray-300 rounded-xl shadow-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white font-medium"
            />
            <p className="text-xs text-gray-500">Wähle die Uhrzeit, zu der die Bestellungen importiert werden sollen.</p>
          </div>

          {/* Marketplaces Checklist */}
          <div className="space-y-3">
            <span className="block text-sm font-semibold text-gray-700">Abzurufende Marktplätze</span>
            {activeMarketplaces.length === 0 ? (
              <div className="p-4 bg-gray-100 rounded-xl text-sm text-gray-500 border border-gray-200">
                Keine aktiven Marktplatz-Verbindungen eingerichtet. Bitte verknüpfe zuerst einen Marktplatz weiter unten.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeMarketplaces.map((option) => {
                  const isChecked = selectedMarketplaces.includes(option.value)
                  return (
                    <div
                      key={option.value}
                      onClick={() => handleToggleMarketplace(option.value)}
                      className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer select-none transition-all duration-200 ${
                        isChecked
                          ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="fetchOrdersMarketplaces"
                        value={option.value}
                        checked={isChecked}
                        readOnly
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="block text-sm font-bold text-gray-900">{option.label}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden inputs to pass data when checkboxes are used */}
      <input
        type="hidden"
        name="marketplacesList"
        value={JSON.stringify(selectedMarketplaces)}
      />

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="w-full sm:w-auto px-6 py-2.5 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {pending ? 'Wird gespeichert...' : 'Automatisierung speichern'}
        </button>
      </div>
    </form>
  )
}

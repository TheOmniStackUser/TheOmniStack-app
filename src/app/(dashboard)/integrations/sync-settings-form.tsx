'use client'

import { useActionState, useState, useEffect } from 'react'
import { saveSyncSettingsAction } from '@/app/actions/integrations'
import { HelpCircle, Clock, CheckCircle, Plus, Trash2 } from 'lucide-react'

type MarketplaceOption = {
  value: string
  label: string
}

type SyncSettingsFormProps = {
  company: {
    fetchOrdersDaily: boolean
    fetchOrdersTime: string
    fetchOrdersTimes?: string[] | null
    fetchOrdersMarketplaces: string[]
    syncNotificationEmail: string | null
  }
  activeMarketplaces: MarketplaceOption[]
}

export function SyncSettingsForm({ company, activeMarketplaces }: SyncSettingsFormProps) {
  const [state, action, pending] = useActionState(saveSyncSettingsAction, undefined)
  const [isEnabled, setIsEnabled] = useState(company.fetchOrdersDaily)
  const [syncTimes, setSyncTimes] = useState<string[]>(() => {
    if (company.fetchOrdersTimes && company.fetchOrdersTimes.length > 0) {
      return company.fetchOrdersTimes
    }
    return [company.fetchOrdersTime || '03:00']
  })
  const [selectedMarketplaces, setSelectedMarketplaces] = useState<string[]>(
    company.fetchOrdersMarketplaces || []
  )

  useEffect(() => {
    if (company.fetchOrdersTimes && company.fetchOrdersTimes.length > 0) {
      setSyncTimes(company.fetchOrdersTimes)
    } else if (company.fetchOrdersTime) {
      setSyncTimes([company.fetchOrdersTime])
    }
  }, [company.fetchOrdersTimes, company.fetchOrdersTime])

  useEffect(() => {
    setSelectedMarketplaces(company.fetchOrdersMarketplaces || [])
  }, [company.fetchOrdersMarketplaces])

  const handleToggleMarketplace = (value: string) => {
    setSelectedMarketplaces((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    )
  }

  const handleTimeChange = (index: number, val: string) => {
    setSyncTimes((prev) => {
      const next = [...prev]
      next[index] = val
      return next
    })
  }

  const handleAddTime = () => {
    setSyncTimes((prev) => {
      let newTime = '10:00'
      if (prev.includes(newTime)) {
        if (!prev.includes('14:00')) newTime = '14:00'
        else if (!prev.includes('18:00')) newTime = '18:00'
        else if (!prev.includes('22:00')) newTime = '22:00'
        else newTime = '12:00'
      }
      return [...prev, newTime]
    })
  }

  const handleRemoveTime = (index: number) => {
    setSyncTimes((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== index)
    })
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
                  Wenn aktiviert, ruft theomnistack zu den konfigurierten Uhrzeiten automatisch neue, unversandte Bestellungen von den ausgewählten Marktplätzen ab.
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
          {/* Multiple Times Configuration */}
          <div className="p-4 bg-white rounded-2xl border border-gray-150 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div>
                <label className="block text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-600" />
                  Abruf-Uhrzeiten (täglich)
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Füge bei Bedarf mehrere Uhrzeiten pro Tag für den automatischen Import hinzu.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddTime}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 rounded-xl transition-all cursor-pointer border border-blue-200 active:scale-95 select-none"
              >
                <Plus className="w-3.5 h-3.5" />
                Weitere Uhrzeit
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {syncTimes.map((time, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2.5 bg-gray-50/70 border border-gray-200 rounded-xl shadow-xs transition-all hover:border-gray-300"
                >
                  <span className="text-xs font-semibold text-gray-500 min-w-[62px]">
                    {idx + 1}. Abruf:
                  </span>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => handleTimeChange(idx, e.target.value)}
                    required
                    aria-label={`Abruf-Uhrzeit ${idx + 1}`}
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg shadow-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white font-medium text-sm"
                  />
                  {syncTimes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTime(idx)}
                      title="Uhrzeit entfernen"
                      aria-label={`Uhrzeit ${idx + 1} entfernen`}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Email Notification */}
          <div className="space-y-2">
            <label htmlFor="syncNotificationEmail" className="block text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Benachrichtigungs-E-Mail (Optional)
            </label>
            <input
              id="syncNotificationEmail"
              name="syncNotificationEmail"
              type="email"
              defaultValue={company.syncNotificationEmail || ''}
              placeholder="z.B. info@dein-shop.de"
              className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl shadow-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white font-medium"
            />
            <p className="text-xs text-gray-500">Erhalte eine E-Mail-Zusammenfassung nach jedem automatischen Import.</p>
          </div>

          {/* Marketplaces Checklist */}
          <div className="space-y-3">
            <div>
              <span className="block text-sm font-semibold text-gray-700">Abzurufende Marktplätze</span>
              <p className="text-xs text-gray-500 mt-0.5">
                Es werden nur deine aktiv verbundenen Marktplätze gelistet. Neue Kanäle kannst du weiter unten hinzufügen.
              </p>
            </div>
            {activeMarketplaces.length === 0 ? (
              <div className="p-4 bg-gray-100 rounded-xl text-sm text-gray-500 border border-gray-200">
                Keine aktiven Marktplatz-Verbindungen eingerichtet. Bitte verknüpfe zuerst einen Marktplatz weiter unten.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                  <span className="text-xs text-gray-500">
                    {selectedMarketplaces.length} von {activeMarketplaces.length} Marktplätzen ausgewählt
                  </span>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedMarketplaces.length === activeMarketplaces.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedMarketplaces(activeMarketplaces.map((m) => m.value))
                        } else {
                          setSelectedMarketplaces([])
                        }
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    Alle auswählen
                  </label>
                </div>

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
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <span className="block text-sm font-bold text-gray-900">{option.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden inputs to pass data */}
      <input
        type="hidden"
        name="fetchOrdersTimes"
        value={JSON.stringify(syncTimes)}
      />
      <input
        type="hidden"
        name="fetchOrdersTime"
        value={syncTimes[0] || '03:00'}
      />
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

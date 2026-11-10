'use client'

import { useActionState, useState, useEffect, useMemo } from 'react'
import { saveSyncSettingsAction } from '@/app/actions/integrations'
import { generateIntervalTimes } from '@/lib/sync-schedule'
import { HelpCircle, Clock, CheckCircle, Plus, Trash2, Repeat, ListFilter, Calendar } from 'lucide-react'

type MarketplaceOption = {
  value: string
  label: string
}

type SyncSettingsFormProps = {
  company: {
    fetchOrdersDaily: boolean
    fetchOrdersScheduleMode?: string | null
    fetchOrdersInterval?: string | null
    fetchOrdersBusinessHoursStart?: string | null
    fetchOrdersBusinessHoursEnd?: string | null
    fetchOrdersTime: string
    fetchOrdersTimes?: string[] | null
    fetchOrdersMarketplaces: string[]
    syncNotificationEmail: string | null
  }
  activeMarketplaces: MarketplaceOption[]
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`)

export function SyncSettingsForm({ company, activeMarketplaces }: SyncSettingsFormProps) {
  const [state, action, pending] = useActionState(saveSyncSettingsAction, undefined)
  const [isEnabled, setIsEnabled] = useState(company.fetchOrdersDaily)
  const [scheduleMode, setScheduleMode] = useState<'interval' | 'times'>(
    (company.fetchOrdersScheduleMode as 'interval' | 'times') || 'interval'
  )
  const [interval, setInterval] = useState<'30' | '60' | '120'>(
    (company.fetchOrdersInterval as '30' | '60' | '120') || '60'
  )
  const [businessHoursStart, setBusinessHoursStart] = useState<string>(
    company.fetchOrdersBusinessHoursStart || '08:00'
  )
  const [businessHoursEnd, setBusinessHoursEnd] = useState<string>(
    company.fetchOrdersBusinessHoursEnd || '18:00'
  )
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
    if (company.fetchOrdersScheduleMode) {
      setScheduleMode(company.fetchOrdersScheduleMode as 'interval' | 'times')
    }
    if (company.fetchOrdersInterval) {
      setInterval(company.fetchOrdersInterval as '30' | '60' | '120')
    }
    if (company.fetchOrdersBusinessHoursStart) {
      setBusinessHoursStart(company.fetchOrdersBusinessHoursStart)
    }
    if (company.fetchOrdersBusinessHoursEnd) {
      setBusinessHoursEnd(company.fetchOrdersBusinessHoursEnd)
    }
    if (company.fetchOrdersTimes && company.fetchOrdersTimes.length > 0) {
      setSyncTimes(company.fetchOrdersTimes)
    } else if (company.fetchOrdersTime) {
      setSyncTimes([company.fetchOrdersTime])
    }
  }, [
    company.fetchOrdersScheduleMode,
    company.fetchOrdersInterval,
    company.fetchOrdersBusinessHoursStart,
    company.fetchOrdersBusinessHoursEnd,
    company.fetchOrdersTimes,
    company.fetchOrdersTime
  ])

  useEffect(() => {
    setSelectedMarketplaces(company.fetchOrdersMarketplaces || [])
  }, [company.fetchOrdersMarketplaces])

  const calculatedIntervalTimes = useMemo(() => {
    return generateIntervalTimes(parseInt(interval, 10), businessHoursStart, businessHoursEnd)
  }, [interval, businessHoursStart, businessHoursEnd])

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

  const effectiveTimesToSave = scheduleMode === 'interval' ? calculatedIntervalTimes : syncTimes

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

      {/* Auto-Sync Activation Toggle */}
      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-150 shadow-sm transition-all hover:shadow-md">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">Automatischen Bestellabruf aktivieren</span>
            <div className="group relative">
              <HelpCircle size={14} className="text-gray-400 cursor-help hover:text-blue-500 transition-colors" />
              <div className="absolute left-6 top-0 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 transform -translate-y-1/4">
                <p className="leading-relaxed text-slate-300">
                  Wenn aktiviert, ruft theomnistack automatisch neue Bestellungen im konfigurierten Intervall oder zu festgelegten Uhrzeiten von deinen Marktplätzen ab.
                </p>
                <div className="absolute left-0 top-3 -translate-x-full border-8 border-transparent border-r-slate-900"></div>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Regelmäßiger Import deiner Bestellungen im Hintergrund.
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
          {/* Schedule Mode Selector */}
          <div className="p-4 bg-white rounded-2xl border border-gray-150 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-1">
                <Repeat className="w-4 h-4 text-blue-600" />
                Abruf-Modus
              </label>
              <p className="text-xs text-gray-500">
                Wähle, ob der Abruf in festen Intervallen während der Arbeitszeit oder zu fixen Einzel-Uhrzeiten erfolgen soll.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setScheduleMode('interval')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  scheduleMode === 'interval'
                    ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Clock className={`w-4 h-4 ${scheduleMode === 'interval' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="text-sm font-bold text-gray-900">Intervall während Geschäftszeiten</span>
                </div>
                <p className="text-xs text-gray-500">
                  Alle 30 Min., 1 Std. oder 2 Std. innerhalb definierter Geschäftszeiten (z. B. 08:00 – 18:00).
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScheduleMode('times')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  scheduleMode === 'times'
                    ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <ListFilter className={`w-4 h-4 ${scheduleMode === 'times' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="text-sm font-bold text-gray-900">Feste Einzel-Uhrzeiten</span>
                </div>
                <p className="text-xs text-gray-500">
                  Individuelle feste Uhrzeiten pro Tag (z. B. 03:00, 12:00, 18:00).
                </p>
              </button>
            </div>

            {/* Mode 1: Interval during business hours */}
            {scheduleMode === 'interval' && (
              <div className="pt-3 border-t border-gray-100 space-y-4 animate-in fade-in duration-200">
                {/* Interval Selection */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Wiederholungs-Intervall
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: '30', label: 'Alle 30 Minuten' },
                      { value: '60', label: 'Jede Stunde' },
                      { value: '120', label: 'Alle 2 Stunden' },
                    ].map((opt) => {
                      const isSelected = interval === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setInterval(opt.value as any)}
                          className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Business Hours */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Geschäftszeiten (Zeitfenster)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-xs text-gray-500 font-medium">Von (Startzeit):</span>
                      <select
                        value={businessHoursStart}
                        onChange={(e) => setBusinessHoursStart(e.target.value)}
                        aria-label="Startzeit der Geschäftszeiten"
                        className="block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-xs text-slate-900 bg-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      >
                        {HOUR_OPTIONS.map((h) => (
                          <option key={h} value={h}>
                            {h} Uhr
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs text-gray-500 font-medium">Bis (Endzeit):</span>
                      <select
                        value={businessHoursEnd}
                        onChange={(e) => setBusinessHoursEnd(e.target.value)}
                        aria-label="Endzeit der Geschäftszeiten"
                        className="block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-xs text-slate-900 bg-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      >
                        {HOUR_OPTIONS.map((h) => (
                          <option key={h} value={h}>
                            {h} Uhr
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Live Preview Summary */}
                <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 text-xs text-blue-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>
                      {calculatedIntervalTimes.length} Abrufe täglich (alle {interval === '30' ? '30 Min.' : interval === '60' ? '1 Std.' : '2 Std.'} von {businessHoursStart} bis {businessHoursEnd} Uhr)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1 max-h-24 overflow-y-auto">
                    {calculatedIntervalTimes.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 bg-white text-blue-700 font-mono font-semibold rounded-md border border-blue-200 text-[11px] shadow-2xs"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Mode 2: Specific Times */}
            {scheduleMode === 'times' && (
              <div className="pt-3 border-t border-gray-100 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Uhrzeitenliste
                  </span>
                  <button
                    type="button"
                    onClick={handleAddTime}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 rounded-xl transition-all cursor-pointer border border-blue-200 active:scale-95 select-none"
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
            )}
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

      {/* Hidden inputs to pass schedule configuration */}
      <input
        type="hidden"
        name="fetchOrdersScheduleMode"
        value={scheduleMode}
      />
      <input
        type="hidden"
        name="fetchOrdersInterval"
        value={interval}
      />
      <input
        type="hidden"
        name="fetchOrdersBusinessHoursStart"
        value={businessHoursStart}
      />
      <input
        type="hidden"
        name="fetchOrdersBusinessHoursEnd"
        value={businessHoursEnd}
      />
      <input
        type="hidden"
        name="fetchOrdersTimes"
        value={JSON.stringify(effectiveTimesToSave)}
      />
      <input
        type="hidden"
        name="fetchOrdersTime"
        value={effectiveTimesToSave[0] || '08:00'}
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

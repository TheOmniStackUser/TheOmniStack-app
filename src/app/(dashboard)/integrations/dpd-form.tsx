'use client'

import { useActionState, useState } from 'react'
import { saveDpdIntegrationAction, testDpdConnectionAction, disconnectDpdAction, type DpdActionState } from '@/app/actions/dpd'
import type { DpdConfig } from '@/adapters/shipping/dpd'
import { Eye, EyeOff, CheckCircle, XCircle, Loader, Settings, ShieldCheck, Trash2, AlertTriangle } from 'lucide-react'

export function DpdIntegrationForm({
  initialDelisId = '',
  initialConfig,
  isActive = false,
}: {
  initialDelisId?: string
  initialConfig?: Partial<DpdConfig>
  isActive?: boolean
}) {
  const [state, action, pending] = useActionState<DpdActionState | undefined, FormData>(saveDpdIntegrationAction, undefined)
  const [showPassword, setShowPassword] = useState(false)
  const [delisId, setDelisId] = useState(initialDelisId)
  const [password, setPassword] = useState('')
  const [depot, setDepot] = useState(initialConfig?.depot || '')
  const [customerNumber, setCustomerNumber] = useState(initialConfig?.customerNumber || '')
  const [environment, setEnvironment] = useState<'production' | 'stage'>(initialConfig?.environment || 'production')
  const [defaultWeight, setDefaultWeight] = useState<number>(initialConfig?.defaultWeight ?? 1.0)
  const [labelFormat, setLabelFormat] = useState<'A6' | 'A4'>(initialConfig?.labelFormat || 'A6')

  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  // Custom disconnect confirmation modal
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const handleTestConnection = async () => {
    setTestStatus('loading')
    setTestMessage('')
    try {
      const res = await testDpdConnectionAction({
        delisId,
        password: password || undefined,
        depot: depot || undefined,
        customerNumber: customerNumber || undefined,
        environment,
      })
      if (res.success) {
        setTestStatus('ok')
        setTestMessage(`Verbindung erfolgreich! Depot: ${res.depot || 'Erkannt'}${res.customerNumber ? `, Kundennummer: ${res.customerNumber}` : ''}`)
      } else {
        setTestStatus('error')
        setTestMessage(res.error || 'Verbindung fehlgeschlagen.')
      }
    } catch (e: any) {
      setTestStatus('error')
      setTestMessage(e.message || 'Netzwerkfehler beim Testen der DPD Verbindung.')
    }
  }

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    try {
      await disconnectDpdAction()
      setShowDisconnectModal(false)
    } finally {
      setIsDisconnecting(false)
    }
  }

  return (
    <div className="w-full max-w-2xl">
      <form action={action} className="space-y-6">
        {/* Status notification */}
        {state?.success && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-sm font-medium">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{state.message || 'DPD-Einstellungen erfolgreich gespeichert.'}</span>
          </div>
        )}

        {state?.errors?.password && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-800 text-sm font-medium">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span>{state.errors.password[0]}</span>
          </div>
        )}

        {/* Credentials Section */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-red-600" />
              <h4 className="font-bold text-slate-900 text-base">DPD Zugangsdaten (B2B Web Services)</h4>
            </div>
            {isActive && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Aktiv
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                DelisID (Benutzername) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="delisId"
                value={delisId}
                onChange={(e) => setDelisId(e.target.value)}
                required
                placeholder="z. B. de_itbisco_dpd"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-500 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
              />
              {state?.errors?.delisId && (
                <p className="mt-1 text-xs text-red-600">{state.errors.delisId[0]}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Passwort {isActive && <span className="text-slate-400 font-normal lowercase">(leer lassen um nicht zu ändern)</span>}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isActive ? '••••••••••••' : 'DPD Passwort eingeben'}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-500 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Depot-Nummer
              </label>
              <input
                type="text"
                name="depot"
                value={depot}
                onChange={(e) => setDepot(e.target.value)}
                placeholder="z. B. 0150 (optional, wird autom. ermittelt)"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-500 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
              />
              <p className="text-[11px] text-slate-500 mt-1">DPD Standort-Depot. Bleibt es leer, wird es automatisch beim Login ausgelesen.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Kundennummer
              </label>
              <input
                type="text"
                name="customerNumber"
                value={customerNumber}
                onChange={(e) => setCustomerNumber(e.target.value)}
                placeholder="z. B. 12345678 (optional)"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-500 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
              />
              <p className="text-[11px] text-slate-500 mt-1">Deine DPD Kundennummer für Rechnungsstellung und Berichte.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Server-Umgebung
            </label>
            <select
              name="environment"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as 'production' | 'stage')}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
            >
              <option value="production">Produktion (Live-System public-dis.dpd.com)</option>
              <option value="stage">Testumgebung (Staging public-dis-stage.dpd.com)</option>
            </select>
          </div>
        </div>

        {/* Shipping Preferences Section */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Settings className="w-5 h-5 text-slate-600" />
            <h4 className="font-bold text-slate-900 text-base">Versand-Einstellungen</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Standard-Paketgewicht (kg)
              </label>
              <input
                type="number"
                name="defaultWeight"
                step="0.1"
                min="0.1"
                value={defaultWeight}
                onChange={(e) => setDefaultWeight(parseFloat(e.target.value) || 1.0)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-500 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
              />
              <p className="text-[11px] text-slate-500 mt-1">Wird verwendet, wenn keine Gewichtsangabe in der Bestellung existiert.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Etikett-Format
              </label>
              <select
                name="labelFormat"
                value={labelFormat}
                onChange={(e) => setLabelFormat(e.target.value as 'A6' | 'A4')}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
              >
                <option value="A6">DIN A6 (Standard Versandetikett 105 x 148 mm)</option>
                <option value="A4">DIN A4 (Ganzseitiger Druck)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">A6 eignet sich für Thermo- und Etikettendrucker.</p>
            </div>
          </div>
        </div>

        {/* Live Test connection section */}
        {testStatus !== 'idle' && (
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 text-sm ${
              testStatus === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : testStatus === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            {testStatus === 'loading' && <Loader className="w-5 h-5 text-slate-500 animate-spin flex-shrink-0 mt-0.5" />}
            {testStatus === 'ok' && <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />}
            {testStatus === 'error' && <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
            <div>
              <p className="font-semibold">{testStatus === 'ok' ? 'Erfolg' : testStatus === 'error' ? 'Fehler' : 'Verbindung wird geprüft...'}</p>
              {testMessage && <p className="text-xs mt-0.5 opacity-90">{testMessage}</p>}
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testStatus === 'loading' || !delisId}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testStatus === 'loading' ? (
                <>
                  <Loader className="w-4 h-4 animate-spin text-slate-500" />
                  Prüfe...
                </>
              ) : (
                'Verbindung testen'
              )}
            </button>

            {isActive && (
              <button
                type="button"
                onClick={() => setShowDisconnectModal(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-red-600 hover:bg-red-50 text-sm font-bold rounded-xl transition-colors"
                title="DPD-Verbindung trennen"
              >
                <Trash2 className="w-4 h-4" />
                Trennen
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? (
              <>
                <Loader className="w-4 h-4 animate-spin text-white" />
                Speichere...
              </>
            ) : (
              'DPD Einstellungen speichern'
            )}
          </button>
        </div>
      </form>

      {/* Custom Disconnect Modal Component (strictly avoids native window.confirm) */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => !isDisconnecting && setShowDisconnectModal(false)}
          />
          <div className="relative bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md border border-slate-200 text-left">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 text-red-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-slate-900">DPD-Verbindung trennen?</h3>
            <p className="text-slate-600 text-sm mt-2 leading-relaxed">
              Möchtest du die DPD-Versandanbindung wirklich deaktivieren? Es können danach keine DPD-Versandlabels mehr für deine Bestellungen generiert werden.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={() => setShowDisconnectModal(false)}
                className="px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={handleDisconnect}
                className="px-4 py-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors inline-flex items-center gap-2"
              >
                {isDisconnecting && <Loader className="w-4 h-4 animate-spin text-white" />}
                Verbindung trennen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

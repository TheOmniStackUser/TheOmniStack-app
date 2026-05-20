'use client'

import { useActionState, useState } from 'react'
import { saveHermesIntegrationAction } from '@/app/actions/integrations'
import { Eye, EyeOff, CheckCircle, XCircle, Loader, Settings, RefreshCw } from 'lucide-react'

export type HermesConfig = {
  platformReturns: Record<string, 'none' | 'enclosed' | 'virtual'>
  defaultParcelClass?: string
}

export function HermesIntegrationForm({ 
  initialClientId,
  initialConfig 
}: { 
  initialClientId: string,
  initialConfig?: HermesConfig
}) {
  const [activeTab, setActiveTab] = useState<'connection' | 'returns' | 'settings'>('connection')
  const [state, action, pending] = useActionState(saveHermesIntegrationAction, undefined)
  const [showPassword, setShowPassword] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  const DEFAULT_PLATFORM_RETURNS: HermesConfig['platformReturns'] = {
    otto: 'none',
    amazon: 'none',
    mirakl_decathlon: 'none',
    shopify: 'none',
    aboutyou: 'none',
  }

  const [platformReturns, setPlatformReturns] = useState<HermesConfig['platformReturns']>(
    initialConfig?.platformReturns ?? DEFAULT_PLATFORM_RETURNS
  )
  const [defaultParcelClass, setDefaultParcelClass] = useState<string>(
    initialConfig?.defaultParcelClass ?? 'XS'
  )

  const handleTest = async () => {
    setTestStatus('loading')
    setTestMessage('')
    try {
      const res = await fetch('/api/shipping/hermes/auth', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.success) {
        setTestStatus('ok')
        setTestMessage(`Verbindung erfolgreich! Token erhalten. Benutzer: ${initialClientId}`)
      } else {
        setTestStatus('error')
        setTestMessage(data.error || `Fehler: ${res.status}`)
      }
    } catch (e) {
      setTestStatus('error')
      setTestMessage('Netzwerkfehler beim Testen der Verbindung.')
    }
  }

  const tabs = [
    { id: 'connection', label: 'Verbindung', icon: Settings },
    { id: 'returns', label: 'Retouren', icon: RefreshCw },
    { id: 'settings', label: 'Einstellungen', icon: Settings },
  ] as const

  return (
    <form action={action} className="w-full max-w-2xl">
      {/* Hidden field for JSON config */}
      <input type="hidden" name="hermesConfig" value={JSON.stringify({ platformReturns, defaultParcelClass })} />

      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {state?.success && (
          <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {state.message}
          </div>
        )}

        {state?.errors && !state.success && (
          <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            <div>
               <p className="font-bold">Speichern fehlgeschlagen</p>
               <p className="opacity-80">{Object.values(state.errors).flat().join(' ')}</p>
            </div>
          </div>
        )}

        {/* ── Tab: Verbindung (Always in DOM but hidden if not active) ──────── */}
        <div className={activeTab === 'connection' ? 'space-y-4' : 'hidden'}>
          {testStatus === 'ok' && (
            <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              {testMessage}
            </div>
          )}
          {testStatus === 'error' && (
            <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              {testMessage}
            </div>
          )}

          <div>
            <label htmlFor="clientId" className="block text-sm font-medium text-gray-700">
              Benutzername (z.B. E-Mail)
            </label>
            <input
              id="clientId"
              name="clientId"
              type="text"
              defaultValue={initialClientId}
              required
              placeholder="Dein Hermes GKP-Benutzername"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="clientSecret" className="block text-sm font-medium text-gray-700">
              Passwort
              {initialClientId && (
                <span className="ml-2 text-xs font-normal text-gray-400">(leer lassen = gespeichert beibehalten)</span>
              )}
            </label>
            <div className="mt-1 relative">
              <input
                id="clientSecret"
                name="clientSecret"
                type={showPassword ? 'text' : 'password'}
                placeholder={initialClientId ? 'Nur ausfüllen um Passwort zu ändern' : 'Dein Hermes GKP-Passwort'}
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {pending ? 'Wird gespeichert...' : 'Konfiguration speichern'}
            </button>

            {initialClientId && (
              <button
                type="button"
                onClick={handleTest}
                disabled={testStatus === 'loading'}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 flex items-center gap-2"
              >
                {testStatus === 'loading'
                  ? <><Loader className="w-4 h-4 animate-spin" /> Teste...</>
                  : '🔗 Verbindung testen'
                }
              </button>
            )}
          </div>
        </div>

        {/* ── Tab: Retouren (Always in DOM but hidden if not active) ────────── */}
        <div className={activeTab === 'returns' ? 'space-y-4' : 'hidden'}>
          <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 border border-blue-100 mb-2">
            <p>Wähle aus, wie Retouren für den jeweiligen Marktplatz gehandhabt werden sollen.</p>
          </div>

          {([
            { key: 'otto',             label: 'Otto',              icon: '🟥' },
            { key: 'amazon',           label: 'Amazon',            icon: '🟧' },
            { key: 'mirakl_decathlon', label: 'Decathlon (Mirakl)', icon: '🟦' },
            { key: 'shopify',          label: 'Shopify',           icon: '🟩' },
            { key: 'aboutyou',         label: 'About You',         icon: '⬜' },
          ] as const).map(({ key, label, icon }) => {
            const value = platformReturns[key] ?? 'none'
            return (
              <div key={key} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{icon}</span>
                    <h4 className="font-bold text-gray-900 text-sm">{label}</h4>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setPlatformReturns(prev => ({ ...prev, [key]: 'none' }))}
                    className={`flex flex-col gap-1 p-3 rounded-lg border-2 text-left transition-all ${
                      value === 'none'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-100 hover:border-blue-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        value === 'none' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                      }`}>
                        {value === 'none' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <span className={`text-xs font-bold ${value === 'none' ? 'text-blue-900' : 'text-gray-600'}`}>
                        Keine Retoure
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlatformReturns(prev => ({ ...prev, [key]: 'enclosed' }))}
                    className={`flex flex-col gap-1 p-3 rounded-lg border-2 text-left transition-all ${
                      value === 'enclosed'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-100 hover:border-blue-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        value === 'enclosed' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                      }`}>
                        {value === 'enclosed' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <span className={`text-xs font-bold ${value === 'enclosed' ? 'text-blue-900' : 'text-gray-600'}`}>
                        Beilage-Label (drucken)
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlatformReturns(prev => ({ ...prev, [key]: 'virtual' }))}
                    className={`flex flex-col gap-1 p-3 rounded-lg border-2 text-left transition-all ${
                      value === 'virtual'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-100 hover:border-blue-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        value === 'virtual' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                      }`}>
                        {value === 'virtual' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <span className={`text-xs font-bold ${value === 'virtual' ? 'text-blue-900' : 'text-gray-600'}`}>
                        Nur Retourennummer
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            )
          })}

          <div className="pt-4">
            <button
              type="submit"
              disabled={pending}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {pending ? 'Wird gespeichert...' : 'Konfiguration speichern'}
            </button>
          </div>
        </div>

        {/* ── Tab: Einstellungen ──────────────────────────────────────────── */}
        <div className={activeTab === 'settings' ? 'space-y-6' : 'hidden'}>
          <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 border border-blue-100">
            <p>Allgemeine Hermes-Einstellungen für alle Sendungen.</p>
          </div>

          {/* Default Parcel Size */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="font-bold text-gray-900 text-sm mb-1">Standard-Paketgröße</h4>
            <p className="text-xs text-gray-500 mb-4">
              Vorauswahl im Label-Dialog. Kann pro Bestellung geändert werden.
            </p>
            <div className="flex gap-2">
              {(['XS', 'S', 'M', 'L', 'XL'] as const).map(size => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setDefaultParcelClass(size)}
                  className={`flex-1 py-3 rounded-xl font-black text-sm transition-all duration-200 border-2 ${
                    defaultParcelClass === size
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={pending}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {pending ? 'Wird gespeichert...' : 'Konfiguration speichern'}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}

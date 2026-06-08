'use client'

import { useActionState, useState } from 'react'
import { saveOttoIntegrationAction } from '@/app/actions/integrations'

import { HelpCircle } from 'lucide-react'

export function OttoIntegrationForm({ 
  companyId,
  initialClientId, 
  initialEnvironment = 'production',
  initialReturnAddressCarrierId = '',
  initialConnectionType = 'service_partner'
}: { 
  companyId: string,
  initialClientId: string, 
  initialEnvironment?: string,
  initialReturnAddressCarrierId?: string,
  initialConnectionType?: string
}) {
  const [state, action, pending] = useActionState(saveOttoIntegrationAction, undefined)
  const [connectionType, setConnectionType] = useState(initialConnectionType)
  const [inviteLink, setInviteLink] = useState('')

  const handleConnectOtto = () => {
    if (!inviteLink) return
    // Set cookie for fallback state mapping
    document.cookie = `otto_oauth_company_id=${companyId}; path=/; max-age=3600`
    
    // Check if link already has query params
    const separator = inviteLink.includes('?') ? '&' : '?'
    window.location.href = `${inviteLink}${separator}state=${companyId}`
  }

  return (
    <form action={action} className="space-y-6 max-w-xl">
      {state?.success && (
        <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md animate-in fade-in slide-in-from-top-1">
          {state.message}
        </div>
      )}

      {state?.errors && !state.success && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md animate-in fade-in slide-in-from-top-1">
          Bitte überprüfe deine Eingaben.
        </div>
      )}

      {/* VERBINDUNGSTYP TOGGLE */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Verbindungstyp</label>
        <input type="hidden" name="connectionType" value={connectionType} />
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setConnectionType('service_partner')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              connectionType === 'service_partner' 
                ? 'bg-white shadow-sm text-blue-600 border border-slate-200' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Service Partner App (OAuth)
          </button>
          <button
            type="button"
            onClick={() => setConnectionType('private')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              connectionType === 'private' 
                ? 'bg-white shadow-sm text-blue-600 border border-slate-200' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Private App (API-Benutzer)
          </button>
        </div>
      </div>      {connectionType === 'private' ? (
        <>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label htmlFor="clientId" className="block text-sm font-semibold text-gray-700">Client ID (API User)</label>
              <div className="group relative">
                <HelpCircle className="w-4 h-4 text-slate-400 cursor-help hover:text-slate-600 transition-colors" />
                <div className="absolute left-6 top-0 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 transform -translate-y-1/4">
                  <p className="font-bold mb-1">Wo finde ich das?</p>
                  <p className="leading-relaxed text-slate-300">
                    Erstelle in Otto Partner Connect unter Konfiguration &gt; API-Zugriff einen neuen "API-Benutzer" oder eine "Private App".
                  </p>
                  <div className="absolute left-0 top-3 -translate-x-full border-8 border-transparent border-r-slate-900"></div>
                </div>
              </div>
            </div>
            <input
              type="text"
              id="clientId"
              name="clientId"
              defaultValue={initialClientId}
              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm text-slate-900 placeholder:text-slate-500"
              placeholder="e.g. 8f72..."
            />
            {state?.errors?.clientId && (
              <p className="text-sm text-red-600 font-medium animate-in slide-in-from-top-1">{state.errors.clientId[0]}</p>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label htmlFor="clientSecret" className="block text-sm font-semibold text-gray-700">Client Secret (Passwort)</label>
              <div className="group relative">
                <HelpCircle className="w-4 h-4 text-slate-400 cursor-help hover:text-slate-600 transition-colors" />
                <div className="absolute left-6 top-0 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 transform -translate-y-1/4">
                  <p className="font-bold mb-1">Wichtig beim Secret</p>
                  <p className="leading-relaxed text-slate-300">
                    Das Client Secret wird nur einmalig bei der Erstellung des API-Benutzers im Otto Portal angezeigt. Falls du es verloren hast, musst du im Portal ein neues Secret generieren.
                  </p>
                  <div className="absolute left-0 top-3 -translate-x-full border-8 border-transparent border-r-slate-900"></div>
                </div>
              </div>
            </div>
            <input
              type="password"
              id="clientSecret"
              name="clientSecret"
              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm text-slate-900 placeholder:text-slate-500"
              placeholder="••••••••••••••••"
            />
            {state?.errors?.clientSecret && (
              <p className="text-sm text-red-600 font-medium animate-in slide-in-from-top-1">{state.errors.clientSecret[0]}</p>
            )}
          </div>
        </>
      ) : (
        <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl space-y-4">
          <div>
            <p className="font-semibold text-blue-900 mb-1">Du nutzt die zentrale TheOmniStack App.</p>
            <p className="text-sm text-blue-800 leading-relaxed">
              Füge unten den Einladungslink ein, den du vom Support erhalten hast, um die Verbindung mit OTTO herzustellen.
            </p>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="inviteLink" className="block text-sm font-semibold text-blue-900">OTTO Einladungslink</label>
            <input
              type="text"
              id="inviteLink"
              value={inviteLink}
              onChange={(e) => setInviteLink(e.target.value)}
              className="w-full px-4 py-2 bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm text-slate-900 placeholder:text-slate-400"
              placeholder="https://portal.otto.market/apps/..."
            />
          </div>

          <button
            type="button"
            onClick={handleConnectOtto}
            disabled={!inviteLink}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-xl transition-colors shadow-sm"
          >
            Jetzt mit OTTO verbinden
          </button>
        </div>
      )}

      <div>
        <label htmlFor="returnAddressCarrierId" className="block text-sm font-medium text-gray-700">Return Address Carrier ID (Optional)</label>
        <input
          id="returnAddressCarrierId"
          name="returnAddressCarrierId"
          type="text"
          defaultValue={initialReturnAddressCarrierId}
          placeholder="z.B. 7423afd2-e7ab-4bae-ac30-048b7c0346c1"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        {state?.errors?.returnAddressCarrierId && <p className="mt-1 text-sm text-red-600">{state.errors.returnAddressCarrierId}</p>}
        <p className="mt-2 text-xs text-gray-500">
          Nur erforderlich, wenn du im Otto Partner Connect mehrere Retourenlager/Versanddienstleister konfiguriert hast.
        </p>
      </div>

      <div>
        <label htmlFor="environment" className="block text-sm font-medium text-gray-700">Umgebung</label>
        <select
          key={initialEnvironment}
          id="environment"
          name="environment"
          defaultValue={initialEnvironment}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
        >
          <option value="production">Produktion (Live)</option>
          <option value="sandbox">Sandbox (Test-Umgebung)</option>
        </select>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {pending ? 'Wird gespeichert...' : 'Zugangsdaten speichern'}
        </button>
      </div>
    </form>
  )
}

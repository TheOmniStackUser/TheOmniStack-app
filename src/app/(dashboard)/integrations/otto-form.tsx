'use client'

import { useActionState, useState } from 'react'
import { saveOttoIntegrationAction } from '@/app/actions/integrations'
import { HelpCircle, ExternalLink } from 'lucide-react'

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
  const [environment, setEnvironment] = useState(initialEnvironment)
  const [inviteLink, setInviteLink] = useState('')

  const handleConnectOtto = () => {
    if (!inviteLink.trim()) return

    // Store company ID in cookie BEFORE navigating away.
    // SameSite=Lax means the cookie IS sent on GET-redirects back to our domain.
    document.cookie = `otto_oauth_company_id=${companyId}; path=/; max-age=3600; SameSite=Lax`

    // Open in same tab so cookies are preserved
    window.location.href = inviteLink.trim()
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

      {/* VERBINDUNGSTYP */}
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
      </div>

      {/* PRIVATE APP */}
      {connectionType === 'private' ? (
        <>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label htmlFor="clientId" className="block text-sm font-semibold text-gray-700">Client ID (API User)</label>
              <div className="group relative">
                <HelpCircle className="w-4 h-4 text-slate-400 cursor-help hover:text-slate-600 transition-colors" />
                <div className="absolute left-6 top-0 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 transform -translate-y-1/4">
                  <p className="font-bold mb-1">Wo finde ich das?</p>
                  <p className="leading-relaxed text-slate-300">Erstelle in Otto Partner Connect unter Konfiguration &gt; API-Zugriff einen neuen &quot;API-Benutzer&quot;.</p>
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
          </div>
          <div className="space-y-1">
            <label htmlFor="clientSecret" className="block text-sm font-semibold text-gray-700">Client Secret (Passwort)</label>
            <input
              type="password"
              id="clientSecret"
              name="clientSecret"
              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm text-slate-900 placeholder:text-slate-500"
              placeholder="••••••••••••••••"
            />
          </div>
        </>
      ) : (
        /* SERVICE PARTNER: Invitation link → sets cookie first */
        <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl space-y-4">
          <div>
            <p className="font-semibold text-blue-900 mb-1">Verbindung via TheOmniStack App</p>
            <p className="text-sm text-blue-800 leading-relaxed">
              Füge den Einladungslink ein, den du im OTTO Developer Portal generiert hast, und klicke dann auf den Button.
              Öffne den Link <strong>nicht</strong> direkt – nur über diesen Button wird die Verbindung korrekt erkannt.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="inviteLink" className="block text-sm font-semibold text-blue-900">
              OTTO Einladungslink
            </label>
            <input
              type="url"
              id="inviteLink"
              value={inviteLink}
              onChange={(e) => setInviteLink(e.target.value)}
              className="w-full px-4 py-2 bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm text-slate-900 placeholder:text-slate-400"
              placeholder="https://portal.otto.market/apps/..."
            />
          </div>

          <button
            type="button"
            onClick={handleConnectOtto}
            disabled={!inviteLink.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-xl transition-colors shadow-sm"
          >
            <ExternalLink className="w-4 h-4" />
            1. Schritt: Jetzt mit OTTO verbinden (App installieren)
          </button>
          
          <div className="pt-4 border-t border-blue-200">
            <p className="text-sm text-blue-800 leading-relaxed mb-2">
              <strong>WICHTIG:</strong> Nachdem du bei OTTO auf "Installieren" geklickt hast und hierher zurückgeleitet wurdest, klicke auf diesen Button, um den Autorisierungs-Token abzurufen:
            </p>
            <a
              href={`/api/auth/otto?environment=${environment}&companyId=${companyId}`}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors shadow-sm"
            >
              2. Schritt: Autorisierung abschließen (Token abrufen)
            </a>
          </div>
        </div>
      )}

      {/* RETURN ADDRESS */}
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
        <p className="mt-2 text-xs text-gray-500">
          Nur erforderlich, wenn du im Otto Partner Connect mehrere Retourenlager konfiguriert hast.
        </p>
      </div>

      {/* ENVIRONMENT */}
      <div>
        <label htmlFor="environment" className="block text-sm font-medium text-gray-700">Umgebung</label>
        <select
          id="environment"
          name="environment"
          value={environment}
          onChange={(e) => setEnvironment(e.target.value)}
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

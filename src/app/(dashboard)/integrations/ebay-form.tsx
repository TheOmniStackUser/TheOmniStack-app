'use client'

import { useActionState } from 'react'
import { saveEbayIntegrationAction } from '@/app/actions/integrations'
import { HelpCircle } from 'lucide-react'
import { DisconnectButton } from './disconnect-button'

export function EbayIntegrationForm({ 
  companyId,
  initialClientId, 
  initialEnvironment = 'production',
  initialRuName = '',
  isConnected = false,
}: { 
  companyId: string,
  initialClientId: string, 
  initialEnvironment?: string,
  initialRuName?: string,
  isConnected?: boolean,
}) {
  const [state, action, pending] = useActionState(saveEbayIntegrationAction, undefined)

  return (
    <div className="space-y-6 max-w-xl">
      {isConnected && (
        <div className="pt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
          <DisconnectButton type="ebay" />
        </div>
      )}

      <form action={action} className="space-y-6">
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

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <label htmlFor="clientId" className="block text-sm font-semibold text-gray-700">Client ID (App ID)</label>
            <div className="group relative">
              <HelpCircle size={14} className="text-gray-400 cursor-help hover:text-blue-500 transition-colors" />
              <div className="absolute left-6 top-0 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 transform -translate-y-1/4">
                <p className="font-bold mb-1">Wo finde ich das?</p>
                <p className="leading-relaxed text-slate-300">
                  Logge dich im <strong>eBay Developers Program</strong> ein. Navigiere zu deinen <strong>Application Keys</strong>. Kopiere die <strong>App ID (Client ID)</strong>.
                </p>
                <div className="absolute left-0 top-3 -translate-x-full border-8 border-transparent border-r-slate-900"></div>
              </div>
            </div>
          </div>
          <input
            id="clientId"
            name="clientId"
            type="text"
            defaultValue={initialClientId}
            required
            placeholder="Deine eBay App ID"
            className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl shadow-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
          />
          {state?.errors?.clientId && <p className="mt-1 text-sm text-red-600">{state.errors.clientId}</p>}
        </div>

        <div className="space-y-1">
          <label htmlFor="clientSecret" className="block text-sm font-semibold text-gray-700">Client Secret (Cert ID)</label>
          <input
            id="clientSecret"
            name="clientSecret"
            type="password"
            required
            placeholder="Deine eBay Cert ID"
            className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl shadow-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
          />
          {state?.errors?.clientSecret && <p className="mt-1 text-sm text-red-600">{state.errors.clientSecret}</p>}
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <label htmlFor="ruName" className="block text-sm font-semibold text-gray-700">RuName (Redirect URL Name)</label>
            <div className="group relative">
              <HelpCircle size={14} className="text-gray-400 cursor-help hover:text-blue-500 transition-colors" />
              <div className="absolute left-6 top-0 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 transform -translate-y-1/4">
                <p className="font-bold mb-1">Wo finde ich den RuName?</p>
                <p className="leading-relaxed text-slate-300">
                  Im <strong>eBay Developers Program</strong> unter <strong>User Tokens</strong> (neben App ID) auf &quot;Get a Token from RuName&quot; klicken. Unten auf <strong>Get a RuName</strong> klicken. Kopiere den generierten RuName hier rein. Trage bei eBay unsere <i>Your auth accepted URL</i> ein (z.B. https://app.theomnistack.de/api/auth/ebay/callback).
                </p>
                <div className="absolute left-0 top-3 -translate-x-full border-8 border-transparent border-r-slate-900"></div>
              </div>
            </div>
          </div>
          <input
            id="ruName"
            name="ruName"
            type="text"
            defaultValue={initialRuName}
            placeholder="Dein generierter eBay RuName (z.B. TheOmniStack-TheOmni-SBX-a...)"
            className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl shadow-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="environment" className="block text-sm font-semibold text-gray-700">Umgebung</label>
          <select
            key={initialEnvironment}
            id="environment"
            name="environment"
            defaultValue={initialEnvironment}
            className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl shadow-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
          >
            <option value="production">Produktion (Live)</option>
            <option value="sandbox">Sandbox (Test-Umgebung)</option>
          </select>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={pending}
            className="w-full sm:w-auto px-6 py-2.5 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all active:scale-95 disabled:opacity-50"
          >
            {pending ? 'Wird gespeichert...' : 'Zugangsdaten speichern'}
          </button>
        </div>
      </form>

      {/* OAuth Connect Button */}
      {initialClientId && initialRuName && (
        <div className="pt-6 border-t border-gray-200">
          <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl space-y-4">
            <div>
              <p className="font-semibold text-blue-900 mb-1">eBay Account verknüpfen</p>
              <p className="text-sm text-blue-800 leading-relaxed">
                Klicke auf den Button unten, um dich bei eBay einzuloggen und theomnistack den Zugriff auf Bestellungen und Retouren zu erlauben.
              </p>
            </div>
            
            <a
              href={`/api/auth/ebay?action=connect&companyId=${companyId}`}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#0064d2] hover:bg-[#0051a8] text-white font-semibold rounded-xl transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
              {isConnected ? 'Verbindung erneuern' : 'Jetzt mit eBay verbinden'}
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

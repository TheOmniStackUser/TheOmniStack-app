'use client'

import { useActionState } from 'react'
import { saveEbayIntegrationAction } from '@/app/actions/integrations'
import { HelpCircle } from 'lucide-react'

export function EbayIntegrationForm({ 
  initialClientId, 
  initialEnvironment = 'production'
}: { 
  initialClientId: string, 
  initialEnvironment?: string
}) {
  const [state, action, pending] = useActionState(saveEbayIntegrationAction, undefined)

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

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="w-full sm:w-auto px-6 py-2.5 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all active:scale-95 disabled:opacity-50"
        >
          {pending ? 'Wird gespeichert...' : 'Zugangsdaten speichern'}
        </button>
      </div>
    </form>
  )
}

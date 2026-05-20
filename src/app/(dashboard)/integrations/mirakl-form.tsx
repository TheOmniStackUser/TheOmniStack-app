'use client'

import { useActionState } from 'react'
import { saveMiraklIntegrationAction } from '@/app/actions/integrations'

import { HelpCircle } from 'lucide-react'

export function MiraklIntegrationForm({ 
  id,
  type,
  initialClientId,
  initialClientSecret,
  initialEnvironment,
  initialApiKey,
  initialCustomName,
}: { 
  id?: string
  type: 'mirakl_decathlon' | 'mirakl_decathlon_eu' | 'mirakl_mediamarkt' | 'mirakl_custom'
  initialClientId: string 
  initialClientSecret: string
  initialEnvironment: string
  initialApiKey: string
  initialCustomName?: string
}) {
  const [state, formAction, pending] = useActionState(saveMiraklIntegrationAction, undefined)
  
  const defaultUrls: Record<string, string> = {
    mirakl_decathlon: 'https://marketplace-decathlon-eu.mirakl.net',
    mirakl_decathlon_eu: 'https://marketplace-decathlon-eu.mirakl.net',
    mirakl_mediamarkt: 'https://mediamarkt-prod.mirakl.net',
    mirakl_custom: ''
  }
  
  const defaultUrl = defaultUrls[type] || ''
  const isHauptaccount = type === 'mirakl_decathlon_eu'

  return (
    <form action={formAction} className="space-y-6 max-w-xl">
      <input type="hidden" name="type" value={type} />
      {id && <input type="hidden" name="id" value={id} />}

      {type === 'mirakl_custom' && (
        <div className="space-y-1">
          <label htmlFor={`${type}-customName`} className="block text-sm font-semibold text-gray-700">Name des Marktplatzes</label>
          <input
            type="text"
            id={`${type}-customName`}
            name="customName"
            defaultValue={initialCustomName || ''}
            required
            className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl shadow-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
            placeholder="z.B. Limango, Worten, B&Q..."
          />
        </div>
      )}
      
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <label htmlFor={`${type}-apiUrl`} className="block text-sm font-semibold text-gray-700">Mirakl API URL</label>
          <div className="group relative">
            <HelpCircle size={14} className="text-gray-400 cursor-help hover:text-blue-500 transition-colors" />
            <div className="absolute left-6 top-0 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 transform -translate-y-1/4">
              <p className="font-bold mb-1">Wo finde ich das?</p>
              <p className="leading-relaxed text-slate-300">
                Logge dich in dein Decathlon/Mirakl Backend ein und kopiere einfach den vorderen Teil der Adresse aus dem Browser (z.B. <strong>https://marketplace-decathlon-eu.mirakl.net</strong>).
              </p>
              <div className="absolute left-0 top-3 -translate-x-full border-8 border-transparent border-r-slate-900"></div>
            </div>
          </div>
        </div>
        <input
          type="text"
          id={`${type}-apiUrl`}
          name="environment"
          defaultValue={initialEnvironment || defaultUrl}
          className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl shadow-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
          placeholder={`z.B. ${defaultUrl}`}
        />
        <p className="text-[11px] text-gray-400 italic px-1">Die URL deines Mirakl-Backends.</p>
      </div>

      {isHauptaccount ? (
        <>
          <div className="space-y-1">
            <label htmlFor={`${type}-clientId`} className="block text-sm font-semibold text-gray-700">Client ID</label>
            <input
              type="text"
              id={`${type}-clientId`}
              name="clientId"
              defaultValue={initialClientId}
              className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl shadow-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
              placeholder="Deine Client ID hier einfügen"
            />
            <p className="text-[11px] text-gray-400 italic px-1">Die eindeutige Kennung deiner API-Integration.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor={`${type}-clientSecret`} className="block text-sm font-semibold text-gray-700">Client Secret</label>
            <input
              type="password"
              id={`${type}-clientSecret`}
              name="clientSecret"
              defaultValue={initialClientSecret}
              className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl shadow-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
              placeholder="Dein Client Secret hier einfügen"
            />
            <p className="text-[11px] text-gray-400 italic px-1">Das Passwort deiner API-Integration.</p>
            {state?.errors?.clientSecret && (
              <p className="mt-1 text-sm text-red-600">{state.errors.clientSecret[0]}</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor={`${type}-apiKey`} className="block text-sm font-semibold text-gray-700">Seller company ID (Audience)</label>
            <input
              type="text"
              id={`${type}-apiKey`}
              name="apiKey"
              defaultValue={initialApiKey}
              className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl shadow-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
              placeholder="Deine Seller ID hier einfügen"
            />
            <p className="text-[11px] text-gray-400 italic px-1">Deine Firmen-ID aus Mirakl Connect.</p>
          </div>
        </>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <label htmlFor={`${type}-clientId`} className="block text-sm font-semibold text-gray-700">Mirakl API-Key (Legacy)</label>
            <div className="group relative">
              <HelpCircle size={14} className="text-gray-400 cursor-help hover:text-blue-500 transition-colors" />
              <div className="absolute left-6 top-0 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 transform -translate-y-1/4">
                <p className="font-bold mb-1">Wo finde ich das?</p>
                <p className="leading-relaxed text-slate-300">
                  Logge dich im <strong>Backend deiner Mirakl-Instanz</strong> ein. Klicke oben rechts auf dein Profil &gt; <strong>Persönliche Einstellungen</strong> &gt; <strong>API-Schlüssel</strong>.
                </p>
                <div className="absolute left-0 top-3 -translate-x-full border-8 border-transparent border-r-slate-900"></div>
              </div>
            </div>
          </div>
          <input
            type="password"
            id={`${type}-clientId`}
            name="clientId"
            defaultValue={initialClientId}
            className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl shadow-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
            placeholder="Deinen Mirakl API-Key hier einfügen..."
          />
          {state?.errors?.clientId && (
            <p className="mt-1 text-sm text-red-600">{state.errors.clientId[0]}</p>
          )}
        </div>
      )}

      {state?.message && (
        <div className={`p-4 rounded-xl text-sm animate-in fade-in slide-in-from-top-1 ${state.success ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
          {state.message}
        </div>
      )}

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

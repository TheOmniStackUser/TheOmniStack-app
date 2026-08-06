'use client'

import { useActionState } from 'react'
import { saveEtsyIntegrationAction } from '@/app/actions/integrations'
import { ExternalLink } from 'lucide-react'
import { DisconnectButton } from './disconnect-button'

export function EtsyIntegrationForm({
  companyId,
  initialClientId = '',
  initialClientSecret = '',
  isConnected = false,
}: {
  companyId: string
  initialClientId?: string
  initialClientSecret?: string
  isConnected?: boolean
}) {
  const [state, action, pending] = useActionState(saveEtsyIntegrationAction, undefined)

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

      <div>
        <label htmlFor="clientId" className="block text-sm font-medium text-gray-700">Keystring (Client ID)</label>
        <input
          id="clientId"
          name="clientId"
          type="text"
          defaultValue={initialClientId}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
          required
        />
        {state?.errors?.clientId && (
          <p className="mt-1 text-sm text-red-600">{state.errors.clientId[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="clientSecret" className="block text-sm font-medium text-gray-700">Shared Secret (Client Secret)</label>
        <input
          id="clientSecret"
          name="clientSecret"
          type="password"
          defaultValue={initialClientSecret}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
          required
        />
        {state?.errors?.clientSecret && (
          <p className="mt-1 text-sm text-red-600">{state.errors.clientSecret[0]}</p>
        )}
      </div>

      <div className="pt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {pending ? 'Wird gespeichert...' : 'Zugangsdaten speichern'}
        </button>
        {isConnected && <DisconnectButton type="etsy" />}
      </div>

      {initialClientId && (
        <div className="pt-6 border-t border-gray-200">
          <div className="p-5 bg-orange-50 border border-orange-200 rounded-xl space-y-4">
            <div>
              <p className="font-semibold text-orange-900 mb-1">Etsy Shop verknüpfen</p>
              <p className="text-sm text-orange-800 leading-relaxed">
                Um die Einrichtung abzuschließen, musst du der App Zugriff auf deinen Etsy Shop gewähren.
                Klicke auf den Button unten, um dich bei Etsy einzuloggen und die App zu autorisieren.
              </p>
            </div>
            
            <a
              href={`/api/auth/etsy?action=connect&companyId=${companyId}`}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#F16521] hover:bg-[#D55315] text-white font-semibold rounded-xl transition-colors shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              {isConnected ? 'Verbindung erneuern' : 'Jetzt mit Etsy verbinden'}
            </a>
          </div>
        </div>
      )}
    </form>
  )
}

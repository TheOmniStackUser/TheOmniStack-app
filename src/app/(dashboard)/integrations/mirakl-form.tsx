'use client'

import { useActionState } from 'react'
import { saveMiraklIntegrationAction } from '@/app/actions/integrations'

export function MiraklIntegrationForm({ 
  type,
  initialClientId,
  initialClientSecret,
  initialEnvironment,
  initialApiKey
}: { 
  type: 'mirakl_decathlon' | 'mirakl_decathlon_eu' | 'mirakl_mediamarkt'
  initialClientId: string 
  initialClientSecret: string
  initialEnvironment: string
  initialApiKey: string
}) {
  const [state, formAction, pending] = useActionState(saveMiraklIntegrationAction, undefined)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="type" value={type} />
      
      <div>
        <label htmlFor={`${type}-apiUrl`} className="block text-sm font-medium text-gray-700">Mirakl API URL</label>
        <input
          type="text"
          id={`${type}-apiUrl`}
          name="environment"
          defaultValue={initialEnvironment}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="e.g. https://decathlon-prod.mirakl.net"
        />
        <p className="mt-1 text-[10px] text-gray-400 italic">Zu finden im Mirakl-Backend unter Einstellungen &gt; API</p>
      </div>

      <div>
        <label htmlFor={`${type}-clientId`} className="block text-sm font-medium text-gray-700">API Key</label>
        <input
          type="text"
          id={`${type}-clientId`}
          name="clientId"
          defaultValue={initialClientId}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Deinen Mirakl API-Key hier einfügen..."
        />
        {state?.errors?.clientId && (
          <p className="mt-1 text-sm text-red-600">{state.errors.clientId[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor={`${type}-clientSecret`} className="block text-sm font-medium text-gray-700">Client Secret</label>
        <input
          type="password"
          id={`${type}-clientSecret`}
          name="clientSecret"
          defaultValue={initialClientSecret}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Client Secret aus Mirakl kopieren..."
        />
        {state?.errors?.clientSecret && (
          <p className="mt-1 text-sm text-red-600">{state.errors.clientSecret[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor={`${type}-apiKey`} className="block text-sm font-medium text-gray-700">Company ID (Audience)</label>
        <input
          type="text"
          id={`${type}-apiKey`}
          name="apiKey"
          defaultValue={initialApiKey}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="e.g. your-company-id"
        />
        <p className="mt-1 text-[10px] text-gray-400 italic">Die "audience" aus deinem Mirakl Screenshot</p>
      </div>

      {state?.message && (
        <div className={`p-3 rounded-md text-sm ${state.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {state.message}
        </div>
      )}

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

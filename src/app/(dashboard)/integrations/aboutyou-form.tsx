'use client'

import { useActionState } from 'react'
import { saveAboutYouIntegrationAction } from '@/app/actions/integrations'

export function AboutYouIntegrationForm({ 
  initialApiKey, 
  initialEnvironment = 'production'
}: { 
  initialApiKey: string, 
  initialEnvironment?: string
}) {
  const [state, action, pending] = useActionState(saveAboutYouIntegrationAction, undefined)

  return (
    <form action={action} className="space-y-4 max-w-xl">
      {state?.success && (
        <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md">
          {state.message}
        </div>
      )}

      {state?.errors && !state.success && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
          Bitte überprüfe deine Eingaben.
        </div>
      )}

      <div>
        <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700">API-Key</label>
        <input
          id="apiKey"
          name="apiKey"
          type="password"
          defaultValue={initialApiKey}
          required
          placeholder="Dein About You API-Key"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        {state?.errors?.apiKey && <p className="mt-1 text-sm text-red-600">{state.errors.apiKey}</p>}
        <p className="mt-2 text-xs text-gray-500">
          Diesen findest du im About You Seller Center unter Integration &gt; API.
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

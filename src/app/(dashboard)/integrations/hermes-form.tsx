'use client'

import { useActionState } from 'react'
import { saveHermesIntegrationAction } from '@/app/actions/integrations'

export function HermesIntegrationForm({ initialClientId }: { initialClientId: string }) {
  const [state, action, pending] = useActionState(saveHermesIntegrationAction, undefined)

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
        <label htmlFor="clientId" className="block text-sm font-medium text-gray-700">Benutzername (z.B. E-Mail)</label>
        <input
          id="clientId"
          name="clientId"
          type="text"
          defaultValue={initialClientId}
          required
          placeholder="Dein Hermes Benutzername"
          autoComplete="off"
          data-lpignore="true"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        {state?.errors?.clientId && <p className="mt-1 text-sm text-red-600">{state.errors.clientId}</p>}
      </div>

      <div>
        <label htmlFor="clientSecret" className="block text-sm font-medium text-gray-700">Passwort</label>
        <input
          id="clientSecret"
          name="clientSecret"
          type="password"
          required
          placeholder={initialClientId ? '••••••••••••••••' : 'Dein Hermes Passwort'}
          autoComplete="new-password"
          data-lpignore="true"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        {state?.errors?.clientSecret && <p className="mt-1 text-sm text-red-600">{state.errors.clientSecret}</p>}
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

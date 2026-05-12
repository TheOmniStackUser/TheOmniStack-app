'use client'

import { useActionState } from 'react'
import { saveOttoIntegrationAction } from '@/app/actions/integrations'

export function OttoIntegrationForm({ 
  initialClientId, 
  initialEnvironment = 'production',
  initialReturnAddressCarrierId = ''
}: { 
  initialClientId: string, 
  initialEnvironment?: string,
  initialReturnAddressCarrierId?: string
}) {
  const [state, action, pending] = useActionState(saveOttoIntegrationAction, undefined)

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
        <label htmlFor="clientId" className="block text-sm font-medium text-gray-700">Client ID (API User)</label>
        <input
          id="clientId"
          name="clientId"
          type="text"
          defaultValue={initialClientId}
          required
          placeholder="z.B. user_abc123"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        {state?.errors?.clientId && <p className="mt-1 text-sm text-red-600">{state.errors.clientId}</p>}
      </div>

      <div>
        <label htmlFor="clientSecret" className="block text-sm font-medium text-gray-700">Client Secret (Passwort)</label>
        <input
          id="clientSecret"
          name="clientSecret"
          type="password"
          required={!initialClientId}
          placeholder={initialClientId ? '••••••••••••••••' : 'Dein Otto.de API Passwort'}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        {state?.errors?.clientSecret && <p className="mt-1 text-sm text-red-600">{state.errors.clientSecret}</p>}
        <p className="mt-2 text-xs text-gray-500">
          Dein Client Secret wird sicher gespeichert und kann nach dem Speichern nicht mehr im Klartext angezeigt werden.
        </p>
      </div>

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

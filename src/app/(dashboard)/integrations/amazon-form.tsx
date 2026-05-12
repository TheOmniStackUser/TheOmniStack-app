'use client'

import { useActionState } from 'react'
import { saveAmazonIntegrationAction } from '@/app/actions/integrations'

export function AmazonIntegrationForm({ 
  initialSellerId,
  initialClientId,
  initialClientSecret,
  initialRefreshToken
}: { 
  initialSellerId: string 
  initialClientId: string 
  initialClientSecret: string
  initialRefreshToken: string
}) {
  const [state, formAction, pending] = useActionState(saveAmazonIntegrationAction, undefined)

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="sellerId" className="block text-sm font-medium text-gray-700">Amazon Seller ID</label>
          <input
            type="text"
            id="sellerId"
            name="sellerId"
            defaultValue={initialSellerId}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            placeholder="e.g. A1PA6795UKMFR9"
          />
        </div>

        <div>
          <label htmlFor="clientId" className="block text-sm font-medium text-gray-700">LWA Client ID</label>
          <input
            type="text"
            id="clientId"
            name="clientId"
            defaultValue={initialClientId}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            placeholder="amzn1.application-oa2-client.abc123..."
          />
        </div>
      </div>

      <div>
        <label htmlFor="clientSecret" className="block text-sm font-medium text-gray-700">LWA Client Secret</label>
        <input
          type="password"
          id="clientSecret"
          name="clientSecret"
          defaultValue={initialClientSecret}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          placeholder="Client Secret aus dem Amazon Developer Center..."
        />
      </div>

      <div>
        <label htmlFor="refreshToken" className="block text-sm font-medium text-gray-700">LWA Refresh Token</label>
        <textarea
          id="refreshToken"
          name="refreshToken"
          rows={3}
          defaultValue={initialRefreshToken}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          placeholder="Atzr|IwEBI..."
        />
        <p className="mt-1 text-[10px] text-gray-400 italic">Diesen Token erhältst du nach der Autorisierung deiner App im Amazon Seller Central.</p>
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
          className="w-full px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 transition-colors"
        >
          {pending ? 'Wird gespeichert...' : 'Amazon Zugangsdaten speichern'}
        </button>
      </div>
    </form>
  )
}

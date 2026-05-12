'use client'

import { useActionState } from 'react'
import { saveShopifyIntegrationAction } from '@/app/actions/integrations'

export function ShopifyIntegrationForm({ initialData }: { initialData?: any }) {
  const [state, action, isPending] = useActionState(saveShopifyIntegrationAction, undefined)

  return (
    <form action={action} className="space-y-4">
      {state?.message && (
        <div className={`p-3 rounded-md text-sm font-medium ${state.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {state.message}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Shopify Store URL</label>
        <input
          type="url"
          name="environment"
          defaultValue={initialData?.environment || ''}
          placeholder="https://mein-shop.myshopify.com"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
        />
        {state?.errors?.environment && <p className="mt-1 text-sm text-red-600">{state.errors.environment[0]}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
        <input
          type="text"
          name="clientId"
          defaultValue={initialData?.clientId || ''}
          placeholder="Client ID eingeben"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
        />
        {state?.errors?.clientId && <p className="mt-1 text-sm text-red-600">{state.errors.clientId[0]}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
        <input
          type="password"
          name="clientSecret"
          defaultValue={initialData?.clientSecret || ''}
          placeholder="Client Secret eingeben"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
        />
        {state?.errors?.clientSecret && <p className="mt-1 text-sm text-red-600">{state.errors.clientSecret[0]}</p>}
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Wird gespeichert...' : 'Speichern'}
        </button>
      </div>
    </form>
  )
}

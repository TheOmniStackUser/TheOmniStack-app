'use client'

import { useActionState } from 'react'
import { saveShopwareIntegrationAction, type IntegrationFormState } from '@/app/actions/integrations'
import { HelpCircle } from 'lucide-react'

interface ShopwareIntegrationFormProps {
  initialEnvironment?: string
  initialClientId?: string
}

export function ShopwareIntegrationForm({
  initialEnvironment = '',
  initialClientId = '',
}: ShopwareIntegrationFormProps) {
  const [state, action, isPending] = useActionState<IntegrationFormState, FormData>(
    saveShopwareIntegrationAction,
    undefined
  )

  return (
    <form action={action} className="w-full max-w-lg space-y-5">
      {/* Success / Error Banner */}
      {state?.success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>{state.message}</span>
        </div>
      )}
      {state && !state.success && state.message && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{state.message}</span>
        </div>
      )}

      {/* Shop URL */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label htmlFor="sw-environment" className="block text-sm font-medium text-gray-700">
            Shopware 6 Shop URL
          </label>
          <div className="group relative flex items-center">
            <HelpCircle className="w-4 h-4 text-gray-400 hover:text-[#189EFF] cursor-help transition-colors" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl z-50 font-normal">
              <p>
                Die URL deines Shopware-Shops, z.B. <strong>https://meinshop.de</strong>.<br /><br />
                Muss erreichbar sein und Shopware 6 (Admin API) betreiben.
              </p>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          </div>
        </div>
        <input
          type="url"
          id="sw-environment"
          name="environment"
          defaultValue={initialEnvironment}
          required
          placeholder="https://meinshop.de"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#189EFF] focus:border-[#189EFF] text-black placeholder-gray-400 text-sm"
        />
        {state?.errors?.environment && (
          <p className="mt-1 text-xs text-red-600">{state.errors.environment[0]}</p>
        )}
      </div>

      {/* Access Key ID (Client ID) */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label htmlFor="sw-clientId" className="block text-sm font-medium text-gray-700">
            Access Key ID
          </label>
          <div className="group relative flex items-center">
            <HelpCircle className="w-4 h-4 text-gray-400 hover:text-[#189EFF] cursor-help transition-colors" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl z-50 font-normal">
              <p>
                In deinem Shopware Admin unter <strong>Einstellungen → System → Integrationen → Integration anlegen</strong>.<br /><br />
                Aktiviere die <strong>Administrator</strong>-Rolle oder erstelle eine Rolle mit Bestellzugriff. Die <strong>Access Key ID</strong> wird nach dem Speichern angezeigt.
              </p>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          </div>
        </div>
        <input
          type="text"
          id="sw-clientId"
          name="clientId"
          defaultValue={initialClientId}
          required
          placeholder="SWIAXXXXXXXXXXXXXXXXXXXXXXXXXX"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#189EFF] focus:border-[#189EFF] text-black placeholder-gray-400 text-sm font-mono"
        />
        {state?.errors?.clientId && (
          <p className="mt-1 text-xs text-red-600">{state.errors.clientId[0]}</p>
        )}
      </div>

      {/* Secret Access Key (Client Secret) */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label htmlFor="sw-clientSecret" className="block text-sm font-medium text-gray-700">
            Secret Access Key
          </label>
          <div className="group relative flex items-center">
            <HelpCircle className="w-4 h-4 text-gray-400 hover:text-[#189EFF] cursor-help transition-colors" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl z-50 font-normal">
              <p>Das Secret Access Key wird nur einmal in Shopware angezeigt. Kopiere es sofort nach der Erstellung der Integration.</p>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          </div>
        </div>
        <input
          type="password"
          id="sw-clientSecret"
          name="clientSecret"
          required
          placeholder="••••••••••••••••••••••••••••••"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#189EFF] focus:border-[#189EFF] text-black placeholder-gray-400 text-sm font-mono"
        />
        {state?.errors?.clientSecret && (
          <p className="mt-1 text-xs text-red-600">{state.errors.clientSecret[0]}</p>
        )}
        {initialClientId && (
          <p className="mt-1 text-xs text-gray-500">Lass dieses Feld leer, um das gespeicherte Secret beizubehalten.</p>
        )}
      </div>

      {/* Info Box */}
      <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
        <p className="font-semibold mb-1">OAuth2 Verbindungstest</p>
        <p>Beim Speichern wird automatisch ein OAuth2-Token von deinem Shopware 6 Shop angefordert, um die Zugangsdaten zu verifizieren.</p>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-[#189EFF] hover:bg-[#0d8ce8] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#189EFF] disabled:opacity-50 transition-colors"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Verbinde mit Shopware...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
            </svg>
            Speichern & Testen
          </span>
        )}
      </button>
    </form>
  )
}

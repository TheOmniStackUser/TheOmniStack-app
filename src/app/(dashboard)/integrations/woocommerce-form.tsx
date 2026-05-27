'use client'

import { useActionState, useEffect } from 'react'
import { saveWooCommerceIntegrationAction, type IntegrationFormState } from '@/app/actions/integrations'
import { HelpCircle } from 'lucide-react'

interface WooCommerceIntegrationFormProps {
  initialEnvironment?: string
  initialClientId?: string
}

export function WooCommerceIntegrationForm({
  initialEnvironment = '',
  initialClientId = '',
}: WooCommerceIntegrationFormProps) {
  const [state, action, isPending] = useActionState<IntegrationFormState, FormData>(
    saveWooCommerceIntegrationAction,
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
          <label htmlFor="wc-environment" className="block text-sm font-medium text-gray-700">
            WooCommerce Shop URL
          </label>
          <div className="group relative flex items-center">
            <HelpCircle className="w-4 h-4 text-gray-400 hover:text-[#96588a] cursor-help transition-colors" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl z-50 font-normal">
              <p>
                Die vollständige URL deines WordPress-Shops, z.B. <strong>https://meinshop.de</strong>.<br /><br />
                Stelle sicher, dass WooCommerce installiert ist und die REST API aktiviert ist (WooCommerce → Einstellungen → Erweitert → REST API).
              </p>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          </div>
        </div>
        <input
          type="url"
          id="wc-environment"
          name="environment"
          defaultValue={initialEnvironment}
          required
          placeholder="https://meinshop.de"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#96588a] focus:border-[#96588a] text-black placeholder-gray-400 text-sm"
        />
        {state?.errors?.environment && (
          <p className="mt-1 text-xs text-red-600">{state.errors.environment[0]}</p>
        )}
      </div>

      {/* Consumer Key */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label htmlFor="wc-clientId" className="block text-sm font-medium text-gray-700">
            Consumer Key
          </label>
          <div className="group relative flex items-center">
            <HelpCircle className="w-4 h-4 text-gray-400 hover:text-[#96588a] cursor-help transition-colors" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl z-50 font-normal">
              <p>
                In deinem WordPress Admin unter <strong>WooCommerce → Einstellungen → Erweitert → REST API → Schlüssel hinzufügen</strong>.<br /><br />
                Erstelle einen Schlüssel mit <strong>Lese/Schreib</strong>-Berechtigung. Der Consumer Key beginnt mit <strong>ck_</strong>.
              </p>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          </div>
        </div>
        <input
          type="text"
          id="wc-clientId"
          name="clientId"
          defaultValue={initialClientId}
          required
          placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#96588a] focus:border-[#96588a] text-black placeholder-gray-400 text-sm font-mono"
        />
        {state?.errors?.clientId && (
          <p className="mt-1 text-xs text-red-600">{state.errors.clientId[0]}</p>
        )}
      </div>

      {/* Consumer Secret */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label htmlFor="wc-clientSecret" className="block text-sm font-medium text-gray-700">
            Consumer Secret
          </label>
          <div className="group relative flex items-center">
            <HelpCircle className="w-4 h-4 text-gray-400 hover:text-[#96588a] cursor-help transition-colors" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl z-50 font-normal">
              <p>Das Consumer Secret wird nur einmal angezeigt. Es beginnt mit <strong>cs_</strong>. Trage es hier ein und speichere es sicher.</p>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          </div>
        </div>
        <input
          type="password"
          id="wc-clientSecret"
          name="clientSecret"
          required
          placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#96588a] focus:border-[#96588a] text-black placeholder-gray-400 text-sm font-mono"
        />
        {state?.errors?.clientSecret && (
          <p className="mt-1 text-xs text-red-600">{state.errors.clientSecret[0]}</p>
        )}
        {initialClientId && (
          <p className="mt-1 text-xs text-gray-500">Lass dieses Feld leer, um das gespeicherte Secret beizubehalten.</p>
        )}
      </div>

      {/* Info Box */}
      <div className="rounded-md bg-purple-50 border border-purple-200 p-3 text-xs text-purple-800">
        <p className="font-semibold mb-1">Verbindungstest</p>
        <p>Beim Speichern wird automatisch eine Verbindung zu deinem WooCommerce-Shop aufgebaut, um die Zugangsdaten zu prüfen.</p>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-[#96588a] hover:bg-[#7d4a73] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#96588a] disabled:opacity-50 transition-colors"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Verbinde mit WooCommerce...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.5 11.3c-.1-.5-.4-.9-.8-1.2-.4-.3-.9-.4-1.4-.3l-6.9 1.2-1.1-6.2c-.1-.5-.4-.9-.8-1.2-.4-.3-.9-.4-1.4-.3-.5.1-.9.4-1.2.8-.3.4-.4.9-.3 1.4l1.4 8c.2 1 1.1 1.7 2.1 1.5l7.7-1.3c.5-.1.9-.4 1.2-.8.3-.4.4-.9.3-1.4zM21.2 6.2c-.1-.5-.4-.9-.8-1.2-.4-.3-.9-.4-1.4-.3l-1.5.3.5 2.9 1.5-.3c.5-.1.9-.4 1.2-.8.3-.4.4-.9.3-1.4l-.2-.2z"/>
            </svg>
            Speichern & Testen
          </span>
        )}
      </button>
    </form>
  )
}

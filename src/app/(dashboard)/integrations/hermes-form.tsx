'use client'

import { useActionState, useState } from 'react'
import { saveHermesIntegrationAction } from '@/app/actions/integrations'
import { Eye, EyeOff, CheckCircle, XCircle, Loader } from 'lucide-react'

export function HermesIntegrationForm({ initialClientId }: { initialClientId: string }) {
  const [state, action, pending] = useActionState(saveHermesIntegrationAction, undefined)
  const [showPassword, setShowPassword] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  const handleTest = async () => {
    setTestStatus('loading')
    setTestMessage('')
    try {
      const res = await fetch('/api/shipping/hermes/auth', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.success) {
        setTestStatus('ok')
        setTestMessage(`Verbindung erfolgreich! Token erhalten. Benutzer: ${initialClientId}`)
      } else {
        setTestStatus('error')
        setTestMessage(data.error || `Fehler: ${res.status}`)
      }
    } catch (e) {
      setTestStatus('error')
      setTestMessage('Netzwerkfehler beim Testen der Verbindung.')
    }
  }

  return (
    <form action={action} className="space-y-4 max-w-xl">
      {state?.success && (
        <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {state.message}
        </div>
      )}

      {state?.errors && !state.success && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
          {Object.values(state.errors).flat().join(' ')}
        </div>
      )}

      {/* Test Result Banner */}
      {testStatus === 'ok' && (
        <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {testMessage}
        </div>
      )}
      {testStatus === 'error' && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {testMessage}
        </div>
      )}

      <div>
        <label htmlFor="clientId" className="block text-sm font-medium text-gray-700">
          Benutzername (z.B. E-Mail)
        </label>
        <input
          id="clientId"
          name="clientId"
          type="text"
          defaultValue={initialClientId}
          required
          placeholder="Dein Hermes GKP-Benutzername"
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        {state?.errors?.clientId && <p className="mt-1 text-sm text-red-600">{state.errors.clientId}</p>}
      </div>

      <div>
        <label htmlFor="clientSecret" className="block text-sm font-medium text-gray-700">
          Passwort
          {initialClientId && (
            <span className="ml-2 text-xs font-normal text-gray-400">(leer lassen = gespeichertes Passwort beibehalten)</span>
          )}
        </label>
        <div className="mt-1 relative">
          <input
            id="clientSecret"
            name="clientSecret"
            type={showPassword ? 'text' : 'password'}
            placeholder={initialClientId ? 'Nur ausfüllen um Passwort zu ändern' : 'Dein Hermes GKP-Passwort'}
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {state?.errors?.clientSecret && <p className="mt-1 text-sm text-red-600">{state.errors.clientSecret}</p>}
      </div>

      <div className="pt-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {pending ? 'Wird gespeichert...' : 'Zugangsdaten speichern'}
        </button>

        {initialClientId && (
          <button
            type="button"
            onClick={handleTest}
            disabled={testStatus === 'loading'}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 flex items-center gap-2"
          >
            {testStatus === 'loading'
              ? <><Loader className="w-4 h-4 animate-spin" /> Teste Verbindung...</>
              : '🔗 Verbindung testen'
            }
          </button>
        )}
      </div>
    </form>
  )
}

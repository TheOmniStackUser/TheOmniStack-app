'use client'

import { useActionState } from 'react'
import { startRegistrationAction } from '@/app/actions/auth'
import Link from 'next/link'

export default function RegisterPage() {
  const [state, action, pending] = useActionState(startRegistrationAction, undefined)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Konto erstellen</h1>
          <p className="text-gray-500 mt-2">Starte mit theomnistack</p>
        </div>

        <form action={action} className="space-y-6">
          {state?.message && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {state.message}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">E-Mail</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={state?.fields?.email || ''}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            {state?.errors?.email && <p className="mt-1 text-sm text-red-600">{state.errors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Passwort</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              pattern="(?=.*[0-9])(?=.*[A-Z]).{8,}"
              title="Muss mindestens 8 Zeichen lang sein und einen Großbuchstaben sowie eine Zahl enthalten."
              defaultValue={state?.fields?.password || ''}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-black focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            {state?.errors?.password && (
              <ul className="mt-1 text-sm text-red-600 list-disc list-inside">
                {state.errors.password.map((err: string) => <li key={err}>{err}</li>)}
              </ul>
            )}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {pending ? 'Sende Bestätigungslink...' : 'E-Mail bestätigen'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <p className="text-gray-600">
            Bereits ein Konto?{' '}
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
              Hier anmelden
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

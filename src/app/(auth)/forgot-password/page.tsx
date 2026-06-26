'use client'

import { useActionState } from 'react'
import { forgotPasswordAction } from '@/app/actions/auth'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(forgotPasswordAction, undefined)

  const isSuccess = state?.fields?.success === 'true'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Passwort vergessen?</h1>
          <p className="text-gray-500 mt-2">Gib deine E-Mail-Adresse ein, und wir senden dir einen Link zum Zurücksetzen deines Passworts.</p>
        </div>

        {isSuccess ? (
          <div className="text-center">
            <div className="mb-6 p-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg">
              {state.message}
            </div>
            <Link
              href="/login"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Zurück zum Login
            </Link>
          </div>
        ) : (
          <form action={action} className="space-y-6">
            {state?.message && !isSuccess && (
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
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="max@beispiel.de"
              />
              {state?.errors?.email && <p className="mt-1 text-sm text-red-600">{state.errors.email}</p>}
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {pending ? 'Wird gesendet...' : 'Link anfordern'}
            </button>

            <div className="text-center text-sm">
              <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
                Zurück zum Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

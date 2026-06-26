'use client'

import { useActionState } from 'react'
import { resetPasswordAction } from '@/app/actions/auth'
import Link from 'next/link'
import { useSearchParams, redirect } from 'next/navigation'
import { Suspense } from 'react'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [state, action, pending] = useActionState(resetPasswordAction, undefined)

  if (!token) {
    redirect('/login')
  }

  const isSuccess = state?.fields?.success === 'true'

  return (
    <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Neues Passwort</h1>
        <p className="text-gray-500 mt-2">Bitte gib dein neues Passwort ein.</p>
      </div>

      {isSuccess ? (
        <div className="text-center">
          <div className="mb-6 p-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg">
            {state?.message}
          </div>
          <Link
            href="/login"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Jetzt einloggen
          </Link>
        </div>
      ) : (
        <form action={action} className="space-y-6">
          <input type="hidden" name="token" value={token} />

          {state?.message && !isSuccess && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {state.message}
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Neues Passwort</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Mindestens 8 Zeichen, inkl. Zahl & Großbuchstabe"
            />
            {state?.errors?.password && (
              <ul className="mt-1 text-sm text-red-600 list-disc list-inside">
                {state.errors.password.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {pending ? 'Speichern...' : 'Passwort speichern'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Suspense fallback={<div className="text-gray-500">Laden...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}

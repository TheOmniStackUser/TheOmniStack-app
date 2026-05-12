'use client'

import React, { useActionState } from 'react'
import { verifyTwoFactorLoginAction } from '@/app/actions/auth'
import { ShieldCheck } from 'lucide-react'

export default function TwoFactorLoginPage() {
  const [state, formAction] = useActionState(verifyTwoFactorLoginAction, undefined)

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full space-y-8 p-10 bg-white rounded-2xl shadow-xl border border-slate-100">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 text-blue-600 mb-4">
            <ShieldCheck size={32} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900">2FA Verifizierung</h2>
          <p className="mt-2 text-slate-600">
            Bitte gib den 6-stelligen Code aus deiner Authenticator-App ein.
          </p>
        </div>

        <form action={formAction} className="mt-8 space-y-6">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-slate-700 mb-2">
              Verifizierungscode
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              required
              className="block w-full px-4 py-3 text-center text-3xl font-bold tracking-[0.5em] text-slate-900 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-300"
              placeholder="000000"
              maxLength={6}
              autoFocus
            />
          </div>

          {state?.message && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm font-medium">
              {state.message}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all shadow-lg"
          >
            Verifizieren & Einloggen
          </button>
        </form>

        <div className="text-center">
          <a href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500">
            Zurück zum Login
          </a>
        </div>
      </div>
    </div>
  )
}

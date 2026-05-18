'use client'

import { useActionState } from 'react'
import { acceptInvitationAction } from '@/app/actions/auth'

export function InviteForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, undefined)

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl overflow-hidden shadow-sm items-center justify-center mx-auto border border-slate-100 bg-slate-50">
            <img 
              src="/icon.png" 
              alt="TheOmniStack Logo" 
              className="w-full h-full object-cover animate-pulse-subtle"
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Willkommen bei TheOmniStack</h1>
          <p className="text-sm text-slate-500">
            Aktiviere jetzt deinen Zugang für <span className="font-semibold text-slate-800">{email}</span>
          </p>
        </div>

        <form action={action} className="space-y-6">
          <input type="hidden" name="token" value={token} />

          {state?.message && (
            <div className="p-3.5 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl">
              {state.message}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="password" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
              Wähle dein Passwort
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="••••••••"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-900 bg-white placeholder:text-slate-300"
            />
            {state?.errors?.password && (
              <p className="text-xs font-bold text-red-600 mt-1">{state.errors.password}</p>
            )}
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1.5 text-xs text-slate-500 font-medium">
            <p className="font-bold text-slate-700">Passwort-Richtlinien:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Mindestens 8 Zeichen lang</li>
              <li>Mindestens ein Großbuchstabe (A-Z)</li>
              <li>Mindestens eine Ziffer (0-9)</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full flex justify-center py-3 px-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 shadow-lg disabled:opacity-50 transition-all cursor-pointer"
          >
            {pending ? 'Aktivierung läuft...' : 'Konto aktivieren & Anmelden'}
          </button>
        </form>
      </div>
    </div>
  )
}

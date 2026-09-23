'use client'

import { useState, useActionState } from 'react'
import { submitWiderruf } from './actions'
import { Loader2, CheckCircle2, ShieldCheck } from 'lucide-react'

export default function WiderrufPage() {
  const [state, formAction, isPending] = useActionState(submitWiderruf, {
    success: false,
    message: '',
  })

  // Wenn erfolgreich, zeige die Success-State an
  if (state.success && state.data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8 font-sans">
        <div className="max-w-xl w-full bg-white/80 backdrop-blur-xl border border-slate-200/60 shadow-xl rounded-2xl p-8 sm:p-12 text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">Widerruf erfolgreich übermittelt!</h2>
          <p className="text-slate-600 mb-8">
            Wir haben Ihre Widerrufserklärung erhalten und registriert.
          </p>

          <div className="bg-slate-50 border border-slate-100 rounded-xl p-6 text-left mb-8 space-y-3">
            <h3 className="font-medium text-slate-900 mb-4 border-b border-slate-200 pb-2">Zusammenfassung</h3>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Name:</span>
              <strong className="text-slate-900">{state.data.name}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Bestellnummer:</span>
              <strong className="text-slate-900">{state.data.orderNumber}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Zeitpunkt:</span>
              <strong className="text-slate-900 text-sm">{state.data.timestamp}</strong>
            </div>
          </div>

          <div className="bg-blue-50/50 text-blue-800 text-sm p-4 rounded-lg flex items-start text-left mb-8">
            <ShieldCheck className="w-5 h-5 mr-3 shrink-0 text-blue-600" />
            <p>
              Eine Eingangsbestätigung (dauerhafter Datenträger gemäß § 356a BGB) wurde an Ihre E-Mail-Adresse gesendet.
            </p>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors"
          >
            Weiteren Widerruf einreichen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8 font-sans">
      <div className="max-w-2xl w-full bg-white/90 backdrop-blur-xl border border-slate-200/60 shadow-xl shadow-slate-200/50 rounded-2xl p-6 sm:p-10">
        
        <header className="mb-8 text-center sm:text-left">
          <div className="inline-flex items-center space-x-2 bg-slate-100 px-3 py-1 rounded-full text-xs font-medium text-slate-600 mb-4">
            <ShieldCheck className="w-4 h-4" />
            <span>Gesetzliche Widerrufsfunktion (§ 356a BGB)</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-3">Vertrag widerrufen</h1>
          <p className="text-slate-600 text-sm sm:text-base">
            Hier können Sie Ihren im Online-Shop geschlossenen Vertrag einfach und schnell widerrufen. 
            Nach Absenden erhalten Sie unverzüglich eine Bestätigung per E-Mail.
          </p>
        </header>

        {state.message && !state.success && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm">
            {state.message}
          </div>
        )}

        <form action={formAction} className="space-y-6">
          <div className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                Name des Verbrauchers <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                placeholder="Vor- und Nachname"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all shadow-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="orderNumber" className="block text-sm font-medium text-slate-700 mb-1">
                  Bestellnummer <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="orderNumber"
                  name="orderNumber"
                  required
                  placeholder="z. B. #12345"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all shadow-sm"
                />
              </div>
              <div>
                <label htmlFor="dateOfOrder" className="block text-sm font-medium text-slate-700 mb-1">
                  Datum der Bestellung <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="date"
                  id="dateOfOrder"
                  name="dateOfOrder"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all shadow-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                E-Mail für Bestätigung <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                placeholder="ihre.email@beispiel.de"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all shadow-sm"
              />
            </div>

            <div>
              <label htmlFor="details" className="block text-sm font-medium text-slate-700 mb-1">
                Ergänzende Angaben <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="details"
                name="details"
                rows={3}
                placeholder="z. B. Angabe bestimmter Artikel oder Gründe (optional)"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all shadow-sm resize-none"
              ></textarea>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-4 text-center sm:text-left">
              Mit Klick auf den folgenden Button erklären Sie den Widerruf des oben bezeichneten Vertrags.
            </p>
            <button
              type="submit"
              disabled={isPending}
              className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-8 rounded-xl transition-all flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-slate-900/20"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Wird gesendet...
                </>
              ) : (
                'Widerruf bestätigen'
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  )
}

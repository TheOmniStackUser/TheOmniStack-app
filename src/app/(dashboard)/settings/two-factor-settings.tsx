'use client'

import React, { useState, useActionState } from 'react'
import { setupTwoFactorAction, enableTwoFactorAction, disableTwoFactorAction } from '@/app/actions/auth'
import { Shield, ShieldAlert, ShieldCheck, Copy, Loader2 } from 'lucide-react'

interface Props {
  initialEnabled: boolean
}

export function TwoFactorSettings({ initialEnabled }: Props) {
  const [isEnabled, setIsEnabled] = useState(initialEnabled)
  const [showSetup, setShowSetup] = useState(false)
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  const [state, formAction] = useActionState(enableTwoFactorAction, undefined)

  const handleStartSetup = async () => {
    setIsLoading(true)
    try {
      const data = await setupTwoFactorAction()
      setSetupData(data)
      setShowSetup(true)
    } catch (error) {
      console.error(error)
      alert('Setup fehlgeschlagen.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisable = async () => {
    if (confirm('Möchtest du 2FA wirklich deaktivieren?')) {
      await disableTwoFactorAction()
      setIsEnabled(false)
      setShowSetup(false)
    }
  }

  if (isEnabled) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex gap-4">
            <div className="p-3 rounded-xl bg-green-50 text-green-600">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Zweistufige Authentifizierung (2FA)</h3>
              <p className="text-slate-600 mt-1">
                Dein Konto ist mit einem zusätzlichen Sicherheitsschritt geschützt.
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold uppercase tracking-wider">
            Aktiviert
          </span>
        </div>

        <div className="pt-4 border-t border-slate-50">
          <p className="text-sm font-medium text-slate-500 italic">
            * Die Zwei-Faktor-Authentifizierung ist für dieses Konto verpflichtend und kann nicht deaktiviert werden.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-slate-50 text-slate-600">
          <Shield size={24} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Zweistufige Authentifizierung (2FA)</h3>
          <p className="text-slate-600 mt-1">
            Erhöhe die Sicherheit deines Kontos durch einen zusätzlichen Code bei jedem Login.
          </p>
        </div>
      </div>

      {!showSetup ? (
        <div className="pt-4 border-t border-slate-50">
          <button
            onClick={handleStartSetup}
            disabled={isLoading}
            className="px-6 py-2 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all flex items-center gap-2"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : '2FA Einrichten'}
          </button>
        </div>
      ) : (
        <div className="pt-6 border-t border-slate-50 space-y-6 animate-in fade-in slide-in-from-top-4">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-2xl">
              <img src={setupData?.qrCodeUrl} alt="QR Code" className="w-48 h-48" />
              <p className="mt-4 text-xs text-slate-700 font-mono font-bold bg-slate-50 px-3 py-1 rounded-md border border-slate-100">{setupData?.secret}</p>
            </div>
            
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900">1. App scannen</h4>
              <p className="text-sm text-slate-600">
                Scanne diesen QR-Code mit einer Authenticator-App (z.B. Google Authenticator, Authy oder Bitwarden).
              </p>
              
              <h4 className="font-bold text-slate-900">2. Code verifizieren</h4>
              <p className="text-sm text-slate-600">
                Gib den 6-stelligen Code aus deiner App ein, um die Einrichtung abzuschließen.
              </p>

              <form action={async (fd) => {
                const res = await enableTwoFactorAction(undefined, fd)
                if (res?.message?.includes('erfolgreich')) {
                  setIsEnabled(true)
                  setShowSetup(false)
                } else {
                  alert(res?.message || 'Fehler beim Aktivieren.')
                }
              }} className="space-y-4">
                <input type="hidden" name="secret" value={setupData?.secret} />
                <input
                  name="code"
                  type="text"
                  placeholder="000 000"
                  className="block w-full px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] text-slate-900 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 outline-none placeholder:text-slate-300"
                  required
                />
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all"
                  >
                    Aktivieren
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSetup(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                  >
                    Abbrechen
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

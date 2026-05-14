'use client'

import React, { useState, useEffect } from 'react'
import { setupTwoFactorAction, enableTwoFactorAction } from '@/app/actions/auth'
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function TwoFactorSetup() {
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isActivating, setIsActivating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    async function init() {
      try {
        const data = await setupTwoFactorAction()
        setSetupData(data)
      } catch (error) {
        console.error(error)
      } finally {
        setIsLoading(false)
      }
    }
    init()
  }, [])

  const handleActivate = async (formData: FormData) => {
    setIsActivating(true)
    setErrorMessage(null)
    try {
      const res = await enableTwoFactorAction(undefined, formData)
      if (res?.message?.includes('erfolgreich')) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setErrorMessage(res?.message || 'Fehler beim Aktivieren.')
      }
    } catch (error) {
      console.error(error)
      setErrorMessage('Ein unerwarteter Fehler ist aufgetreten.')
    } finally {
      setIsActivating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="animate-spin text-blue-600" size={40} />
        <p className="text-slate-500 font-medium">QR-Code wird generiert...</p>
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-2 gap-12 items-center">
      <div className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-100 rounded-3xl">
        <img src={setupData?.qrCodeUrl} alt="QR Code" className="w-56 h-56 mix-blend-multiply" />
        <div className="mt-6 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Manueller Key</p>
          <code className="text-sm text-blue-700 font-mono font-bold bg-blue-50 px-4 py-2 rounded-xl border border-blue-100">
            {setupData?.secret}
          </code>
        </div>
      </div>
      
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
            <p className="text-slate-600 text-sm leading-relaxed">
              Scanne den Code mit einer App wie <span className="font-bold text-slate-900">Google Authenticator</span> oder <span className="font-bold text-slate-900">Authy</span>.
            </p>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
            <p className="text-slate-600 text-sm leading-relaxed">
              Gib den 6-stelligen Bestätigungscode hier ein.
            </p>
          </div>
        </div>

        <form action={handleActivate} className="space-y-4">
          <input type="hidden" name="secret" value={setupData?.secret} />
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Verifizierungs-Code</label>
            <input
              name="code"
              type="text"
              placeholder="000 000"
              className={`block w-full px-4 py-4 text-center text-3xl font-bold tracking-[0.3em] text-slate-900 rounded-2xl border-2 transition-all placeholder:text-slate-200 outline-none focus:ring-0 ${
                errorMessage ? 'border-red-500 bg-red-50' : 'border-slate-100 focus:border-blue-600'
              }`}
              required
              autoFocus
              onChange={() => setErrorMessage(null)}
            />
            {errorMessage && (
              <p className="text-xs font-bold text-red-600 mt-2 ml-1 flex items-center gap-1">
                <AlertCircle size={12} /> {errorMessage}
              </p>
            )}
          </div>
          
          <button
            type="submit"
            disabled={isActivating}
            className="w-full py-4 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-xl disabled:opacity-50"
          >
            {isActivating ? <Loader2 className="animate-spin" size={20} /> : (
              <>
                <ShieldCheck size={20} />
                Einrichtung abschließen
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

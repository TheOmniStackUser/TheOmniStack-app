'use client'

import { useState, useEffect } from 'react'
import { getApiKeyAction, generateApiKeyAction } from '@/app/actions/api-keys'
import { CollapsibleSection } from '@/components/collapsible-section'

export function ApiSettings() {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    getApiKeyAction().then((key) => {
      setApiKey(key || null)
      setLoading(false)
    })
  }, [])

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const newKey = await generateApiKeyAction()
      setApiKey(newKey)
      setStatus({ success: true, message: 'Neuer API-Key wurde generiert' })
    } catch (err) {
      setStatus({ success: false, message: 'Fehler beim Generieren' })
    }
    setLoading(false)
  }

  const copyToClipboard = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <CollapsibleSection
      title="Mobile App & API"
      subtitle="Nutze diesen Key, um die OmniScan App mit deinem Account zu verbinden."
      icon={
        <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100">
          <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
      }
      headerClassName="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 bg-gray-50/50 transition-colors select-none"
      defaultOpen={false}
    >
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Dein persönlicher API-Key</label>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={loading ? 'Lädt...' : (apiKey || 'Noch kein Key generiert')}
              readOnly
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 font-mono text-sm text-slate-800 font-semibold outline-none"
            />
            {apiKey && (
              <>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all text-gray-600 cursor-pointer"
                  title={showKey ? 'Verbergen' : 'Anzeigen'}
                >
                  {showKey ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all text-gray-600 cursor-pointer"
                  title="Kopieren"
                >
                  {copied ? (
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className={`px-6 py-2.5 rounded-xl font-bold text-white shadow-sm transition-all flex items-center gap-2 cursor-pointer ${
              loading ? 'bg-gray-400' : 'bg-gray-800 hover:bg-gray-900'
            }`}
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {apiKey ? 'Neuen Key generieren' : 'API-Key erstellen'}
          </button>

          {status && (
            <div className={`text-sm font-medium px-4 py-2 rounded-lg ${status.success ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
              {status.message}
            </div>
          )}
        </div>
        
        <p className="text-xs text-gray-400 italic">
          Hinweis: Dieser persönliche API-Key ist nur für dich. Ein neuer Key macht deinen alten sofort ungültig. Die mobile App muss danach neu verbunden werden. Andere Mitarbeiter sind davon nicht betroffen.
        </p>
      </div>
    </CollapsibleSection>
  )
}

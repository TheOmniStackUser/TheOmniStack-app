'use client'

import { useState, useEffect } from 'react'
import { getApiKeyAction, generateApiKeyAction } from '@/app/actions/api-keys'

export function ApiSettings() {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
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
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          Mobile App & API
        </h3>
        <p className="text-sm text-gray-500">Nutze diesen Key, um die OmniScan App mit deinem Account zu verbinden.</p>
      </div>

      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Dein API-Key</label>
          <div className="flex gap-2">
            <input
              type={apiKey ? 'text' : 'password'}
              value={loading ? 'Lädt...' : (apiKey || 'Noch kein Key generiert')}
              readOnly
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 font-mono text-sm outline-none"
            />
            {apiKey && (
              <button
                onClick={copyToClipboard}
                className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all text-gray-600"
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
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className={`px-6 py-2.5 rounded-xl font-bold text-white shadow-sm transition-all flex items-center gap-2 ${
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
          Hinweis: Ein neuer Key macht den alten sofort ungültig. Die mobile App muss danach neu verbunden werden.
        </p>
      </div>
    </section>
  )
}

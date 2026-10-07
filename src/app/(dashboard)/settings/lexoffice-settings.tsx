'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Company } from '@/db/schema/companies'

export function LexofficeSettings({ company }: { company: Company }) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setMessage('')

    const formData = new FormData(e.currentTarget)
    
    try {
      const res = await fetch('/api/settings/lexoffice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lexofficeApiKey: formData.get('lexofficeApiKey'),
          lexofficeAutoExport: formData.get('lexofficeAutoExport') === 'on',
        })
      })

      if (!res.ok) throw new Error('Fehler beim Speichern')
      
      setMessage('Einstellungen gespeichert.')
      router.refresh()
    } catch (err: any) {
      setMessage(err.message || 'Fehler beim Speichern')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-900">Lexware Office Integration</h2>
        <p className="text-sm text-gray-500 mt-1">
          Exportiere Rechnungen als Belege nach Lexware Office.
        </p>
      </div>

      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
          <div>
            <label htmlFor="lexofficeApiKey" className="block text-sm font-semibold text-slate-900 mb-2">
              Lexware Office API Key (Public API)
            </label>
            <input
              type="password"
              id="lexofficeApiKey"
              name="lexofficeApiKey"
              defaultValue={company.lexofficeApiKey || ''}
              placeholder="z.B. eyJhbGciOiJSUzI1NiIs..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-gray-900 focus:border-gray-900 outline-none transition-all placeholder:text-slate-500 text-slate-900"
            />
            <p className="text-xs text-gray-500 mt-2">
              Erstelle einen API Key unter "Erweiterungen" → "Public API" in deinem Lexoffice Account.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="lexofficeAutoExport"
              name="lexofficeAutoExport"
              defaultChecked={company.lexofficeAutoExport || false}
              className="w-5 h-5 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
            />
            <label htmlFor="lexofficeAutoExport" className="text-sm font-medium text-slate-900">
              Automatisch exportieren
            </label>
          </div>
          <p className="text-xs text-gray-500 -mt-2 ml-8">
            Wenn aktiviert, werden neu erstellte Rechnungen automatisch als Belege zu Lexoffice übertragen.
          </p>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Speichern...' : 'Speichern'}
            </button>
            {message && <span className="text-sm text-gray-600 font-medium">{message}</span>}
          </div>
        </form>
      </div>
    </div>
  )
}

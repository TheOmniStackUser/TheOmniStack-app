'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Company } from '@/db/schema/companies'

export function LexofficeSettings({ company }: { company: Company }) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')

  const isConnected = !!company.lexofficeRefreshToken || !!company.lexofficeApiKey

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
      <div className="p-6 border-b border-gray-100 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Lexware Office Integration</h2>
          <p className="text-sm text-gray-500 mt-1">
            Exportiere Rechnungen als Belege nach Lexware Office.
          </p>
        </div>
        {isConnected ? (
          <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            Verbunden
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
            Nicht verbunden
          </span>
        )}
      </div>

      <div className="p-6">
        {!isConnected ? (
          <div className="max-w-xl">
            <p className="text-sm text-gray-600 mb-6">
              Verbinde deinen Lexware Office Account, um Rechnungen automatisch als Belege zu übertragen. Du wirst zu Lexoffice weitergeleitet, um die Verknüpfung zu bestätigen.
            </p>
            <a
              href="/api/auth/lexoffice"
              className="inline-flex items-center px-6 py-2.5 bg-[#0096d6] text-white font-medium rounded-xl hover:bg-[#007cb3] transition-colors"
            >
              Mit Lexware Office verbinden
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
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
              
              <a
                href="/api/auth/lexoffice/disconnect"
                className="ml-auto px-4 py-2 text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Verbindung trennen
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

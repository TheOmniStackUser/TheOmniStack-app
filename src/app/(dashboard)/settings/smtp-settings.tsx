'use client'

import { useActionState, useState } from 'react'
import { saveCompanySmtpSettingsAction, testSmtpConnectionAction } from '@/app/actions/settings'
import type { Company } from '@/db/schema/companies'
import { CollapsibleSection } from '@/components/collapsible-section'
import { Mail, Loader2, Server } from 'lucide-react'

export function SmtpSettings({ company }: { company: Company }) {
  const [state, action, isPending] = useActionState(saveCompanySmtpSettingsAction, undefined)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const smtp = (company.smtpSettings as any) || {}

  const handleTestConnection = async (e: React.MouseEvent) => {
    e.preventDefault()
    setTesting(true)
    setTestResult(null)

    const form = (e.currentTarget as HTMLElement).closest('form')
    if (!form) {
      setTesting(false)
      return
    }

    const formData = new FormData(form)
    try {
      const res = await testSmtpConnectionAction(formData)
      setTestResult(res)
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Verbindungstest fehlgeschlagen.'
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div id="smtp-settings">
      <CollapsibleSection
        title="E-Mail-Versand (SMTP-Anbindung)"
        subtitle="Option 2: Verbinde deinen eigenen Mailserver, um Dokumente über deine eigene E-Mail-Adresse zu versenden."
        icon={
        <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100">
          <Mail className="w-6 h-6 text-gray-500" />
        </div>
      }
      headerClassName="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 bg-gray-50/50 transition-colors select-none"
      defaultOpen={smtp.enabled}
    >
      <form action={action} className="p-6 space-y-6">
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 p-4 rounded-xl">
          <input
            type="checkbox"
            name="enabled"
            id="smtp-enabled"
            defaultChecked={smtp.enabled}
            className="w-4.5 h-4.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
          />
          <label htmlFor="smtp-enabled" className="text-sm font-bold text-slate-800 cursor-pointer select-none">
            Eigene SMTP-Anbindung aktivieren (Option 2)
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">SMTP-Host</label>
            <input
              name="host"
              type="text"
              defaultValue={smtp.host || ''}
              placeholder="smtp.example.com"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Port</label>
            <input
              name="port"
              type="text"
              defaultValue={smtp.port || ''}
              placeholder="587"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Benutzername</label>
            <input
              name="username"
              type="text"
              defaultValue={smtp.username || ''}
              placeholder="user@example.com"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Passwort</label>
            <input
              name="password"
              type="password"
              defaultValue={smtp.password || ''}
              placeholder="••••••••••••"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Verschlüsselung</label>
            <select
              name="encryption"
              defaultValue={smtp.encryption || 'tls'}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white text-gray-900"
            >
              <option value="ssl">SSL/TLS (Port 465)</option>
              <option value="tls">STARTTLS (Port 587 / 25)</option>
              <option value="none">Keine (Unverschlüsselt)</option>
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Absender-E-Mail (Auswahl im Dropdown)</label>
            <input
              name="fromEmail"
              type="email"
              defaultValue={smtp.fromEmail || ''}
              placeholder="info@yourcompany.com"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Absender-Name</label>
            <input
              name="fromName"
              type="text"
              defaultValue={smtp.fromName || ''}
              placeholder="Musterfirma GmbH"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-gray-100">
          <button
            type="submit"
            disabled={isPending}
            className={`px-6 py-2.5 rounded-xl font-bold text-white shadow-sm transition-all cursor-pointer ${
              isPending ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isPending ? 'Speichert...' : 'Einstellungen speichern'}
          </button>
          
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="px-6 py-2.5 rounded-xl border border-gray-200 hover:bg-slate-50 transition-all text-gray-700 font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {testing && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
            Verbindung testen
          </button>

          {state?.message && (
            <div className={`text-sm font-medium px-4 py-2 rounded-lg ${state.success ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
              {state.message}
            </div>
          )}

          {testResult && (
            <div className={`text-sm font-medium px-4 py-2 rounded-lg ${testResult.success ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
              {testResult.message}
            </div>
          )}
        </div>
      </form>
    </CollapsibleSection>
  </div>
  )
}

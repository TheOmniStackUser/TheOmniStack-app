'use client'

import { CollapsibleSection } from '@/components/collapsible-section'
import type { Company } from '@/db/schema/companies'
import { FileText, Check } from 'lucide-react'

interface DocumentTextSettingsProps {
  company: Company
  isPending?: boolean
  state?: { success: boolean; message: string } | null
}

export function DocumentTextSettings({ company, isPending, state }: DocumentTextSettingsProps) {
  return (
    <CollapsibleSection
      title="Dokumenten-Einstellungen"
      subtitle="Zusätzliche Texte für Lieferscheine, Rechnungen und Angebote."
      icon={
        <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100">
          <FileText className="text-gray-500 w-6 h-6" />
        </div>
      }
      headerClassName="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 bg-gray-50/50 transition-colors select-none"
      defaultOpen={false}
    >
      <div className="p-6 space-y-8">
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sprache für internationale Sendungen</label>
          <select
            name="internationalLanguage"
            defaultValue={company.internationalLanguage || 'en'}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
          >
            <option value="de">Deutsch</option>
            <option value="en">Englisch</option>
          </select>
          <p className="text-xs text-gray-500">Diese Sprache wird verwendet, wenn das Lieferland nicht Deutschland ist.</p>
        </div>

        {/* Lieferschein footers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider text-blue-600">Lieferschein-Fußtext (DE)</label>
            <textarea
              name="deliveryNoteFooter"
              defaultValue={company.deliveryNoteFooter || ''}
              rows={6}
              placeholder="Bitte beachten Sie im Falle einer Retoure folgendes:..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900"
            />
            <p className="text-xs text-gray-500">Wird bei Sendungen innerhalb Deutschlands verwendet.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider text-blue-600">Lieferschein-Fußtext (EN)</label>
            <textarea
              name="deliveryNoteFooterEn"
              defaultValue={company.deliveryNoteFooterEn || ''}
              rows={6}
              placeholder="In case of a return, please note the following:..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900"
            />
            <p className="text-xs text-gray-500">Wird bei internationalen Sendungen verwendet (falls Englisch gewählt).</p>
          </div>
        </div>

        {/* Rechnungs-Fußtext */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-gray-100">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider text-blue-600">Rechnungs-Fußtext (DE)</label>
            <textarea
              name="invoiceFooter"
              defaultValue={company.invoiceFooter || ''}
              rows={6}
              placeholder="Vielen Dank für Ihren Auftrag! Bitte begleichen Sie den offenen Betrag..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900"
            />
            <p className="text-xs text-gray-500">Wird bei Rechnungen innerhalb Deutschlands verwendet.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider text-blue-600">Rechnungs-Fußtext (EN)</label>
            <textarea
              name="invoiceFooterEn"
              defaultValue={company.invoiceFooterEn || ''}
              rows={6}
              placeholder="Thank you for your order! Please transfer the open amount..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900"
            />
            <p className="text-xs text-gray-500">Wird bei internationalen Rechnungen verwendet (falls Englisch gewählt).</p>
          </div>
        </div>

        {/* Angebots-Fußtext */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-gray-100">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider text-blue-600">Angebots-Fußtext (DE)</label>
            <textarea
              name="offerFooter"
              defaultValue={company.offerFooter || ''}
              rows={6}
              placeholder="Gerne unterbreiten wir Ihnen folgendes Angebot..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900"
            />
            <p className="text-xs text-gray-500">Wird bei Angeboten innerhalb Deutschlands verwendet.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider text-blue-600">Angebots-Fußtext (EN)</label>
            <textarea
              name="offerFooterEn"
              defaultValue={company.offerFooterEn || ''}
              rows={6}
              placeholder="We are pleased to submit the following quote..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900"
            />
            <p className="text-xs text-gray-500">Wird bei internationalen Angeboten verwendet (falls Englisch gewählt).</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-gray-100 mt-2">
          <button
            type="submit"
            disabled={isPending}
            className={`px-6 py-2.5 rounded-xl font-bold text-white text-sm shadow-md transition-all ${
              isPending ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/20'
            }`}
          >
            {isPending ? 'Speichert...' : 'Änderungen speichern'}
          </button>
          {state?.message && (
            <div className={`text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${
              state.success ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
            }`}>
              {state.success && <Check className="w-3.5 h-3.5" />}
              {state.message}
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  )
}

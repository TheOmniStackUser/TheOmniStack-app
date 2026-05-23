'use client'

import { CollapsibleSection } from '@/components/collapsible-section'
import type { Company } from '@/db/schema/companies'
import { FileText } from 'lucide-react'

export function DocumentTextSettings({ company }: { company: Company }) {
  return (
    <CollapsibleSection
      title="Dokumenten-Einstellungen"
      subtitle="Zusätzliche Texte für Lieferscheine und Rechnungen."
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
            form="settings-profile-form"
            defaultValue={company.internationalLanguage || 'en'}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
          >
            <option value="de">Deutsch</option>
            <option value="en">Englisch</option>
          </select>
          <p className="text-xs text-gray-500">Diese Sprache wird verwendet, wenn das Lieferland nicht Deutschland ist.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider text-blue-600">Lieferschein-Fußtext (DE)</label>
            <textarea
              name="deliveryNoteFooter"
              form="settings-profile-form"
              defaultValue={company.deliveryNoteFooter || ''}
              rows={8}
              placeholder="Bitte beachten Sie im Falle einer Retoure folgendes:..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900"
            />
            <p className="text-xs text-gray-500">Wird bei Sendungen innerhalb Deutschlands verwendet.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider text-blue-600">Lieferschein-Fußtext (EN)</label>
            <textarea
              name="deliveryNoteFooterEn"
              form="settings-profile-form"
              defaultValue={company.deliveryNoteFooterEn || ''}
              rows={8}
              placeholder="In case of a return, please note the following:..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900"
            />
            <p className="text-xs text-gray-500">Wird bei internationalen Sendungen verwendet (falls Englisch gewählt).</p>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}

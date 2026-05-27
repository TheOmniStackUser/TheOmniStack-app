'use client'

import { useActionState, useState } from 'react'
import { saveCompanySettingsAction, resendCompanyVerificationEmailAction } from '@/app/actions/settings'
import type { Company } from '@/db/schema/companies'
import { CollapsibleSection } from '@/components/collapsible-section'

export function SettingsForm({ company }: { company: Company }) {
  const [state, action, isPending] = useActionState(saveCompanySettingsAction, undefined)
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState<{ success: boolean; text: string } | null>(null)

  const handleResendVerification = async () => {
    setResending(true)
    setResendMessage(null)
    try {
      const res = await resendCompanyVerificationEmailAction()
      if (res.success) {
        setResendMessage({ success: true, text: res.message || 'Bestätigungs-E-Mail gesendet.' })
      } else {
        setResendMessage({ success: false, text: res.message || 'Fehler beim Senden.' })
      }
    } catch (err) {
      setResendMessage({ success: false, text: 'Verbindungsfehler. Bitte versuche es später erneut.' })
    } finally {
      setResending(false)
    }
  }

  return (
    <form id="settings-profile-form" action={action} className="space-y-8 pb-12">
      {/* --- Section: Stammdaten --- */}
      <CollapsibleSection
        title="Allgemeine Informationen"
        subtitle="Grundlegende Firmendaten und Steuer-IDs."
        headerClassName="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 bg-gray-50/50 transition-colors select-none"
        defaultOpen={true}
      >
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Unternehmensname (Anzeige)</label>
            <input
              name="name"
              type="text"
              defaultValue={company.name}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Rechtlicher Name</label>
            <input
              name="legalName"
              type="text"
              defaultValue={company.legalName}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">USt-IdNr. (VAT ID)</label>
            <input
              name="vatId"
              type="text"
              defaultValue={company.vatId || ''}
              placeholder="DE123456789"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Steuernummer</label>
            <input
              name="taxId"
              type="text"
              defaultValue={company.taxId || ''}
              placeholder="12/345/67890"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">E-Mail</label>
            <input
              name="email"
              type="email"
              defaultValue={company.newPendingEmail || company.email || ''}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
            {company.newPendingEmail && (
              <div className="mt-2 p-3 bg-amber-50/70 border border-amber-200/65 rounded-xl space-y-1">
                <p className="text-xs text-amber-800 leading-normal">
                  Ausstehende Verifizierung für:{' '}
                  <span className="font-semibold text-amber-900">{company.newPendingEmail}</span>.
                  Bis zur Bestätigung wird weiterhin <span className="font-semibold text-amber-900">{company.email || 'keine E-Mail'}</span> verwendet.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resending}
                    className="inline-flex items-center text-xs font-bold text-amber-700 hover:text-amber-900 underline cursor-pointer disabled:opacity-50"
                  >
                    {resending ? 'Sende...' : 'Bestätigungs-Link erneut senden'}
                  </button>
                </div>
                {resendMessage && (
                  <p className={`text-[11px] font-medium ${resendMessage.success ? 'text-green-600' : 'text-red-600'}`}>
                    {resendMessage.text}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Telefon</label>
            <input
              name="phone"
              type="text"
              defaultValue={company.phone || ''}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Webseite</label>
            <input
              name="website"
              type="text"
              defaultValue={company.website || ''}
              placeholder="https://www.example.com"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Firmenlogo (Für Lieferscheine/Rechnungen)</label>
            <div className="flex items-center gap-4">
              {company.logoUrl && (
                <div className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={company.logoUrl} alt="Logo Preview" className="max-w-full max-h-full object-contain" />
                </div>
              )}
              <div className="flex-1">
                <input
                  name="logoFile"
                  type="file"
                  accept="image/png, image/jpeg, image/jpg"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="mt-1 text-xs text-gray-500">Maximal 2MB. Nur PNG oder JPG. Lässt du das Feld leer, bleibt das aktuelle Logo erhalten.</p>
                <input type="hidden" name="existingLogoUrl" value={company.logoUrl || ''} />
              </div>
            </div>
          </div>
          <div className="md:col-span-2 flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-gray-100 mt-2">
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
              <div className={`text-xs font-medium px-3 py-1.5 rounded-lg ${state.success ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                {state.message}
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* --- Section: Rechnungsadresse --- */}
      <CollapsibleSection
        title="Rechnungsadresse"
        subtitle="Diese Adresse wird auf Rechnungen und Dokumenten verwendet."
        headerClassName="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 bg-gray-50/50 transition-colors select-none"
        defaultOpen={false}
      >
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Straße & Hausnummer</label>
            <input
              name="street"
              type="text"
              defaultValue={company.street || ''}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">PLZ</label>
              <input
                name="zip"
                type="text"
                defaultValue={company.zip || ''}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Stadt</label>
              <input
                name="city"
                type="text"
                defaultValue={company.city || ''}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Land</label>
            <select
              name="country"
              defaultValue={company.country || 'DE'}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white text-gray-900"
            >
              <option value="DE">Deutschland</option>
              <option value="AT">Österreich</option>
              <option value="CH">Schweiz</option>
              <option value="FR">Frankreich</option>
              <option value="IT">Italien</option>
              <option value="ES">Spanien</option>
              <option value="NL">Niederlande</option>
            </select>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-gray-100 mt-6">
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
              <div className={`text-xs font-medium px-3 py-1.5 rounded-lg ${state.success ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                {state.message}
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* --- Section: Lageradresse --- */}
      <CollapsibleSection
        title="Lageradresse / Absender"
        subtitle="Diese Adresse wird auf Versandlabels als Absender gedruckt."
        headerClassName="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 bg-gray-50/50 transition-colors select-none"
        defaultOpen={false}
      >
        <div className="p-6 space-y-6">
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-blue-700 leading-relaxed">
              Wenn die Lageradresse leer gelassen wird, verwendet das System automatisch die Rechnungsadresse für Versandlabels.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Straße & Hausnummer</label>
            <input
              name="warehouseStreet"
              type="text"
              defaultValue={company.warehouseStreet || ''}
              placeholder={company.street || 'Wie Rechnungsadresse'}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">PLZ</label>
              <input
                name="warehouseZip"
                type="text"
                defaultValue={company.warehouseZip || ''}
                placeholder={company.zip || ''}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Stadt</label>
              <input
                name="warehouseCity"
                type="text"
                defaultValue={company.warehouseCity || ''}
                placeholder={company.city || ''}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Land</label>
            <select
              name="warehouseCountry"
              defaultValue={company.warehouseCountry || 'DE'}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white text-gray-900"
            >
              <option value="DE">Deutschland</option>
              <option value="AT">Österreich</option>
              <option value="CH">Schweiz</option>
              <option value="FR">Frankreich</option>
              <option value="IT">Italien</option>
              <option value="ES">Spanien</option>
              <option value="NL">Niederlande</option>
            </select>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-gray-100 mt-6">
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
              <div className={`text-xs font-medium px-3 py-1.5 rounded-lg ${state.success ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                {state.message}
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* --- Section: Bank- & Rechtsdaten --- */}
      <CollapsibleSection
        title="Bank- & Rechtsdaten"
        subtitle="Diese Informationen werden in der Fußzeile von Lieferscheinen und Rechnungen gedruckt."
        headerClassName="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 bg-gray-50/50 transition-colors select-none"
        defaultOpen={false}
      >
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Zahlungsempfänger</label>
            <input
              name="paymentRecipient"
              type="text"
              defaultValue={company.paymentRecipient || ''}
              placeholder="Musterfirma GmbH"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Name der Bank</label>
            <input
              name="bankName"
              type="text"
              defaultValue={company.bankName || ''}
              placeholder="VR Bank"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">IBAN</label>
            <input
              name="iban"
              type="text"
              defaultValue={company.iban || ''}
              placeholder="DE12 3456 ..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">BIC</label>
            <input
              name="bic"
              type="text"
              defaultValue={company.bic || ''}
              placeholder="GENO..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Geschäftsführung</label>
            <input
              name="management"
              type="text"
              defaultValue={company.management || ''}
              placeholder="Max Mustermann"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Registergericht & Nr.</label>
            <input
              name="registrationCourt"
              type="text"
              defaultValue={company.registrationCourt || ''}
              placeholder="Amtsgericht München, HRB 12345"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900"
            />
          </div>
          <div className="md:col-span-2 flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-gray-100 mt-2">
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
              <div className={`text-xs font-medium px-3 py-1.5 rounded-lg ${state.success ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                {state.message}
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

    </form>
  )
}

'use client'

import { useState } from 'react'
import { WORLD_COUNTRIES } from '@/lib/countries'
import { MerchantDetailsModal, type MerchantCompanyData } from '@/app/admin/components/merchant-details-modal'

interface CompanyAddressSectionProps {
  initialCompany: MerchantCompanyData
}

export function CompanyAddressSection({ initialCompany }: CompanyAddressSectionProps) {
  const [company, setCompany] = useState<MerchantCompanyData>(initialCompany)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [copiedBilling, setCopiedBilling] = useState(false)
  const [copiedWarehouse, setCopiedWarehouse] = useState(false)

  const billingCountryObj = WORLD_COUNTRIES.find(c => c.code === (company.country || 'DE'))
  const billingCountryName = billingCountryObj
    ? `${billingCountryObj.name} (${billingCountryObj.code})`
    : (company.country || 'DE')

  const warehouseCountryObj = WORLD_COUNTRIES.find(c => c.code === (company.warehouseCountry || 'DE'))
  const warehouseCountryName = warehouseCountryObj
    ? `${warehouseCountryObj.name} (${warehouseCountryObj.code})`
    : (company.warehouseCountry || 'DE')

  const hasBillingAddress = Boolean(company.street || company.zip || company.city)
  const hasWarehouseAddress = Boolean(company.warehouseStreet || company.warehouseZip || company.warehouseCity)

  const handleCopyBillingAddress = async () => {
    const lines = [
      company.legalName || company.name,
      company.street || '',
      `${company.zip || ''} ${company.city || ''}`.trim(),
      billingCountryObj?.name || company.country || 'Deutschland',
    ].filter(Boolean).join('\n')

    try {
      await navigator.clipboard.writeText(lines)
      setCopiedBilling(true)
      setTimeout(() => setCopiedBilling(false), 2200)
    } catch {
      // Clipboard fallback ignored
    }
  }

  const handleCopyWarehouseAddress = async () => {
    const lines = [
      company.legalName || company.name,
      company.warehouseStreet || company.street || '',
      `${company.warehouseZip || company.zip || ''} ${company.warehouseCity || company.city || ''}`.trim(),
      warehouseCountryObj?.name || company.warehouseCountry || 'Deutschland',
    ].filter(Boolean).join('\n')

    try {
      await navigator.clipboard.writeText(lines)
      setCopiedWarehouse(true)
      setTimeout(() => setCopiedWarehouse(false), 2200)
    } catch {
      // Clipboard fallback ignored
    }
  }

  return (
    <>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Firmen- & Rechnungsadresse
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              {company.legalName ? `Rechtlicher Name: ${company.legalName}` : 'Hinterlegte Adress- und Steuerdaten des Händlers'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-300 text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Firmendaten & Adresse bearbeiten
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Rechnungsadresse */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="text-xs font-bold text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Rechnungsadresse
                </span>
                {hasBillingAddress && (
                  <button
                    type="button"
                    onClick={handleCopyBillingAddress}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors cursor-pointer"
                  >
                    {copiedBilling ? (
                      <span className="text-emerald-400 font-semibold">Kopiert!</span>
                    ) : (
                      <span>Kopieren</span>
                    )}
                  </button>
                )}
              </div>

              {hasBillingAddress ? (
                <div className="space-y-1 text-xs font-mono text-white/90">
                  <p className="font-semibold text-white font-sans text-sm mb-1">
                    {company.legalName || company.name}
                  </p>
                  <p>{company.street || '–'}</p>
                  <p>{`${company.zip || ''} ${company.city || ''}`.trim() || '–'}</p>
                  <p className="text-white/50 pt-1">{billingCountryName}</p>
                </div>
              ) : (
                <div className="py-3">
                  <p className="text-xs font-semibold text-amber-300">Keine Rechnungsadresse hinterlegt</p>
                  <p className="text-[11px] text-white/40 mt-0.5">Keine Straße oder PLZ gespeichert.</p>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="mt-2 text-xs text-violet-400 hover:text-violet-300 font-medium cursor-pointer"
                  >
                    + Jetzt erfassen →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 2. Firmen- / Lageradresse */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="text-xs font-bold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Firmen- / Lageradresse
                </span>
                {hasWarehouseAddress && (
                  <button
                    type="button"
                    onClick={handleCopyWarehouseAddress}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors cursor-pointer"
                  >
                    {copiedWarehouse ? (
                      <span className="text-emerald-400 font-semibold">Kopiert!</span>
                    ) : (
                      <span>Kopieren</span>
                    )}
                  </button>
                )}
              </div>

              {hasWarehouseAddress ? (
                <div className="space-y-1 text-xs font-mono text-white/90">
                  <p className="font-semibold text-white font-sans text-sm mb-1">
                    {company.legalName || company.name}
                  </p>
                  <p>{company.warehouseStreet}</p>
                  <p>{`${company.warehouseZip || ''} ${company.warehouseCity || ''}`.trim() || '–'}</p>
                  <p className="text-white/50 pt-1">{warehouseCountryName}</p>
                </div>
              ) : (
                <div className="py-1">
                  <div className="flex items-center gap-1.5 text-white/80 text-xs font-medium mb-1">
                    <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Identisch mit Rechnungsadresse
                  </div>
                  <p className="text-[11px] text-white/40 leading-relaxed">
                    Keine abweichende Lager- oder Absenderadresse hinterlegt.
                  </p>
                  {hasBillingAddress && (
                    <div className="mt-2 pt-2 border-t border-white/5 text-xs font-mono text-white/60">
                      <p>{company.street}</p>
                      <p>{`${company.zip || ''} ${company.city || ''}`.trim()}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 3. Steuer- & Kontaktdaten */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2.5 text-xs">
            <span className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">
              Steuer- & Kontaktdaten
            </span>
            <div className="flex justify-between gap-2">
              <span className="text-white/40">USt-IdNr.:</span>
              <span className="text-white font-mono font-medium">{company.vatId || '–'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-white/40">Steuernummer:</span>
              <span className="text-white font-mono font-medium">{company.taxId || '–'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-white/40">E-Mail:</span>
              <span className="text-white font-medium truncate">{company.email || '–'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-white/40">Telefon:</span>
              <span className="text-white font-medium">{company.phone || '–'}</span>
            </div>
            {company.website && (
              <div className="flex justify-between gap-2">
                <span className="text-white/40">Webseite:</span>
                <a
                  href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:text-violet-300 truncate"
                >
                  {company.website}
                </a>
              </div>
            )}
            {company.iban && (
              <div className="flex justify-between gap-2 pt-1.5 border-t border-white/5">
                <span className="text-white/40">IBAN:</span>
                <span className="text-white font-mono font-medium truncate">{company.iban}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <MerchantDetailsModal
        company={company}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCompanyUpdated={(updated) => setCompany(updated)}
      />
    </>
  )
}

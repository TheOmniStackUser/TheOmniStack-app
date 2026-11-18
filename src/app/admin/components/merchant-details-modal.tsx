'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { WORLD_COUNTRIES } from '@/lib/countries'
import { updateCompanyBillingAddressAction } from '@/app/actions/admin'

export interface BillingCompanyData {
  id: string
  name: string
  legalName?: string | null
  street?: string | null
  zip?: string | null
  city?: string | null
  country?: string | null
  warehouseStreet?: string | null
  warehouseZip?: string | null
  warehouseCity?: string | null
  warehouseCountry?: string | null
  vatId?: string | null
  taxId?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  bankName?: string | null
  iban?: string | null
  bic?: string | null
  paymentRecipient?: string | null
  registeredApp?: string | null
  createdAt?: string | null
  trialExpiresAt?: string | null
  canceledAt?: string | null
  orderCount?: number
  tier?: {
    upTo: number
    pricePerOrder: number
  }
  total?: number
  period?: {
    start: string
    end: string
  }
}

export type MerchantCompanyData = BillingCompanyData

interface MerchantDetailsModalProps {
  company: MerchantCompanyData | null
  isOpen: boolean
  onClose: () => void
  onCompanyUpdated?: (updated: MerchantCompanyData) => void
}

export function MerchantDetailsModal({
  company,
  isOpen,
  onClose,
  onCompanyUpdated,
}: MerchantDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [copiedBilling, setCopiedBilling] = useState(false)
  const [copiedWarehouse, setCopiedWarehouse] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Local form state
  const [formData, setFormData] = useState({
    legalName: '',
    street: '',
    zip: '',
    city: '',
    country: 'DE',
    warehouseStreet: '',
    warehouseZip: '',
    warehouseCity: '',
    warehouseCountry: 'DE',
    vatId: '',
    taxId: '',
    email: '',
    phone: '',
    website: '',
  })

  useEffect(() => {
    if (company) {
      setFormData({
        legalName: company.legalName || company.name || '',
        street: company.street || '',
        zip: company.zip || '',
        city: company.city || '',
        country: company.country || 'DE',
        warehouseStreet: company.warehouseStreet || '',
        warehouseZip: company.warehouseZip || '',
        warehouseCity: company.warehouseCity || '',
        warehouseCountry: company.warehouseCountry || 'DE',
        vatId: company.vatId || '',
        taxId: company.taxId || '',
        email: company.email || '',
        phone: company.phone || '',
        website: company.website || '',
      })
      setIsEditing(false)
      setSaveError(null)
      setCopiedBilling(false)
      setCopiedWarehouse(false)
    }
  }, [company])

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !company) return null

  const billingCountryObj = WORLD_COUNTRIES.find(c => c.code === (company.country || 'DE'))
  const billingCountryName = billingCountryObj ? `${billingCountryObj.name} (${billingCountryObj.code})` : (company.country || 'DE')

  const warehouseCountryObj = WORLD_COUNTRIES.find(c => c.code === (company.warehouseCountry || 'DE'))
  const warehouseCountryName = warehouseCountryObj ? `${warehouseCountryObj.name} (${warehouseCountryObj.code})` : (company.warehouseCountry || 'DE')

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
      // Fallback
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
      // Fallback
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setSaveError(null)

    try {
      await updateCompanyBillingAddressAction(company.id, {
        legalName: formData.legalName,
        street: formData.street,
        zip: formData.zip,
        city: formData.city,
        country: formData.country,
        warehouseStreet: formData.warehouseStreet,
        warehouseZip: formData.warehouseZip,
        warehouseCity: formData.warehouseCity,
        warehouseCountry: formData.warehouseCountry,
        website: formData.website,
        vatId: formData.vatId,
        taxId: formData.taxId,
        email: formData.email,
        phone: formData.phone,
      })

      const updated: MerchantCompanyData = {
        ...company,
        legalName: formData.legalName || company.legalName,
        street: formData.street || null,
        zip: formData.zip || null,
        city: formData.city || null,
        country: formData.country,
        warehouseStreet: formData.warehouseStreet || null,
        warehouseZip: formData.warehouseZip || null,
        warehouseCity: formData.warehouseCity || null,
        warehouseCountry: formData.warehouseCountry,
        website: formData.website || null,
        vatId: formData.vatId || null,
        taxId: formData.taxId || null,
        email: formData.email || null,
        phone: formData.phone || null,
      }

      if (onCompanyUpdated) {
        onCompanyUpdated(updated)
      }

      setIsEditing(false)
    } catch (err: any) {
      setSaveError(err?.message || 'Fehler beim Speichern der Firmendaten.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/75 backdrop-blur-md animate-in fade-in duration-200 text-left"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-2xl bg-[#0f0f1a]/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl text-white overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20 text-white font-bold text-lg shrink-0">
              {company.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-white tracking-tight">{company.name}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30 uppercase tracking-wider">
                  Firmendaten
                </span>
                {company.registeredApp && (
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                    company.registeredApp === 'ProfiFaktura'
                      ? 'bg-yellow-500/10 text-yellow-500 ring-yellow-500/20'
                      : 'bg-blue-500/10 text-blue-400 ring-blue-400/20'
                  }`}>
                    {company.registeredApp}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/40 mt-0.5">
                {company.legalName ? `Rechtlicher Name: ${company.legalName}` : 'Händler-Stammdaten'}
                {company.createdAt && ` · Registriert seit ${new Date(company.createdAt).toLocaleDateString('de-DE')}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-white/40 hover:text-white hover:bg-white/10 p-2 rounded-xl transition-colors cursor-pointer"
            title="Schließen (Esc)"
            aria-label="Schließen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Current Billing Snapshot (if provided) */}
        {company.period && (
          <div className="px-6 py-3.5 bg-violet-950/20 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-white/70">
              <span className="w-2 h-2 rounded-full bg-violet-400"></span>
              <span>Abrechnungszeitraum:</span>
              <strong className="text-white font-medium">
                {new Date(company.period.start).toLocaleDateString('de-DE')} – {new Date(company.period.end).toLocaleDateString('de-DE')}
              </strong>
            </div>
            <div className="flex items-center gap-4 text-white/70">
              <span>Bestellungen: <strong className="text-white font-medium">{company.orderCount ?? 0}</strong></span>
              {company.total !== undefined && (
                <span>
                  Betrag: <strong className="text-violet-300 font-semibold">
                    {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(company.total)}
                  </strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[calc(85vh-200px)] overflow-y-auto">
          {saveError && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {saveError}
            </div>
          )}

          {!isEditing ? (
            /* VIEW MODE */
            <div className="space-y-6">
              {/* Grid with 2 Addresses: Rechnungsadresse & Firmen-/Lageradresse */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Rechnungsadresse */}
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
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
                        title="Rechnungsadresse kopieren"
                      >
                        {copiedBilling ? (
                          <>
                            <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-emerald-400 font-semibold">Kopiert!</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>Kopieren</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {hasBillingAddress ? (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-1 text-sm font-mono text-white/90 flex-1">
                      <p className="font-semibold text-white font-sans text-sm mb-1">
                        {company.legalName || company.name}
                      </p>
                      <p className="text-xs">{company.street || '–'}</p>
                      <p className="text-xs">{`${company.zip || ''} ${company.city || ''}`.trim() || '–'}</p>
                      <p className="text-white/60 text-xs pt-1">{billingCountryName}</p>
                    </div>
                  ) : (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center flex-1 flex flex-col justify-center">
                      <p className="text-xs font-semibold text-amber-300">Keine Rechnungsadresse</p>
                      <p className="text-[11px] text-white/40 mt-1">Keine Straße/PLZ hinterlegt.</p>
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="mt-2 text-[11px] text-amber-200 hover:underline cursor-pointer"
                      >
                        + Adresse erfassen
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Firmenadresse / Lager- & Absenderadresse */}
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
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
                        title="Lager-/Absenderadresse kopieren"
                      >
                        {copiedWarehouse ? (
                          <>
                            <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-emerald-400 font-semibold">Kopiert!</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>Kopieren</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {hasWarehouseAddress ? (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-1 text-sm font-mono text-white/90 flex-1">
                      <p className="font-semibold text-white font-sans text-sm mb-1">
                        {company.legalName || company.name}
                      </p>
                      <p className="text-xs">{company.warehouseStreet}</p>
                      <p className="text-xs">{`${company.warehouseZip || ''} ${company.warehouseCity || ''}`.trim() || '–'}</p>
                      <p className="text-white/60 text-xs pt-1">{warehouseCountryName}</p>
                    </div>
                  ) : (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex-1 flex flex-col justify-center">
                      <div className="flex items-center gap-2 text-white/80 text-xs font-medium mb-1">
                        <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Identisch mit Rechnungsadresse
                      </div>
                      <p className="text-[11px] text-white/40 leading-relaxed">
                        Versandlabels verwenden automatisch die Rechnungsadresse als Absender, da keine separate Lageradresse hinterlegt ist.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Tax & Contact Grid */}
              <div>
                <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2.5">
                  Steuer- & Kontaktinformationen
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                    <p className="text-[11px] text-white/40 uppercase font-medium">USt-IdNr. (VAT ID)</p>
                    <p className="text-sm font-mono text-white mt-1 font-semibold">{company.vatId || '–'}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                    <p className="text-[11px] text-white/40 uppercase font-medium">Steuernummer</p>
                    <p className="text-sm font-mono text-white mt-1 font-semibold">{company.taxId || '–'}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                    <p className="text-[11px] text-white/40 uppercase font-medium">E-Mail</p>
                    <p className="text-sm text-white mt-1 truncate font-medium">{company.email || '–'}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                    <p className="text-[11px] text-white/40 uppercase font-medium">Telefon</p>
                    <p className="text-sm text-white mt-1 font-medium">{company.phone || '–'}</p>
                  </div>
                  {company.website && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 sm:col-span-2">
                      <p className="text-[11px] text-white/40 uppercase font-medium">Webseite</p>
                      <a
                        href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-violet-400 hover:text-violet-300 transition-colors mt-1 inline-flex items-center gap-1.5"
                      >
                        <span>{company.website}</span>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Optional Bank Details */}
              {(company.iban || company.bankName || company.paymentRecipient) && (
                <div>
                  <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2.5">
                    Hinterlegte Bankverbindung
                  </p>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-xs space-y-1.5">
                    {company.paymentRecipient && (
                      <div className="flex justify-between">
                        <span className="text-white/40">Kontoinhaber:</span>
                        <span className="text-white font-medium">{company.paymentRecipient}</span>
                      </div>
                    )}
                    {company.bankName && (
                      <div className="flex justify-between">
                        <span className="text-white/40">Bank:</span>
                        <span className="text-white font-medium">{company.bankName}</span>
                      </div>
                    )}
                    {company.iban && (
                      <div className="flex justify-between">
                        <span className="text-white/40">IBAN:</span>
                        <span className="text-white font-mono font-medium">{company.iban}</span>
                      </div>
                    )}
                    {company.bic && (
                      <div className="flex justify-between">
                        <span className="text-white/40">BIC:</span>
                        <span className="text-white font-mono font-medium">{company.bic}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* EDIT MODE */
            <form id="merchant-company-form" onSubmit={handleSave} className="space-y-5">
              {/* Stammdaten */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-violet-400 uppercase tracking-wider">Unternehmensdaten</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-white/70">Rechtlicher Name</label>
                    <input
                      type="text"
                      required
                      value={formData.legalName}
                      onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                      placeholder="z.B. Muster GmbH"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-white/70">Webseite</label>
                    <input
                      type="text"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-white/70">E-Mail</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="info@firma.de"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-white/70">Telefon</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+49 ..."
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Rechnungsadresse */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <p className="text-xs font-bold text-violet-400 uppercase tracking-wider">Rechnungsadresse</p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-white/70">Straße & Hausnummer</label>
                    <input
                      type="text"
                      value={formData.street}
                      onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                      placeholder="Musterstraße 12"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-white/70">PLZ</label>
                      <input
                        type="text"
                        value={formData.zip}
                        onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                        placeholder="12345"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs font-medium text-white/70">Stadt</label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        placeholder="Musterstadt"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-white/70">Land</label>
                    <select
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                    >
                      {WORLD_COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code} className="bg-slate-900 text-white">
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Firmen-/Lageradresse */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Firmen- / Lageradresse (Absender)</p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-white/70">Straße & Hausnummer (Lager)</label>
                    <input
                      type="text"
                      value={formData.warehouseStreet}
                      onChange={(e) => setFormData({ ...formData, warehouseStreet: e.target.value })}
                      placeholder="Leer lassen falls identisch mit Rechnungsadresse"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-white/70">Lager-PLZ</label>
                      <input
                        type="text"
                        value={formData.warehouseZip}
                        onChange={(e) => setFormData({ ...formData, warehouseZip: e.target.value })}
                        placeholder="12345"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs font-medium text-white/70">Lager-Stadt</label>
                      <input
                        type="text"
                        value={formData.warehouseCity}
                        onChange={(e) => setFormData({ ...formData, warehouseCity: e.target.value })}
                        placeholder="Lagerstadt"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-white/70">Lager-Land</label>
                    <select
                      value={formData.warehouseCountry}
                      onChange={(e) => setFormData({ ...formData, warehouseCountry: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                    >
                      {WORLD_COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code} className="bg-slate-900 text-white">
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Steuern */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wider">Steuer-IDs</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-white/70">USt-IdNr. (VAT ID)</label>
                    <input
                      type="text"
                      value={formData.vatId}
                      onChange={(e) => setFormData({ ...formData, vatId: e.target.value })}
                      placeholder="DE123456789"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-white/70">Steuernummer</label>
                    <input
                      type="text"
                      value={formData.taxId}
                      onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                      placeholder="12/345/67890"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-violet-500 outline-none text-xs"
                    />
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="p-6 border-t border-white/10 bg-white/[0.02] flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/admin/merchants/${company.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors"
          >
            <span>Händlerprofil im Detail ansehen</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-xl border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Daten bearbeiten
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-violet-600/20 cursor-pointer"
                >
                  Fertig
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false)
                    setSaveError(null)
                  }}
                  disabled={isSaving}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-semibold rounded-xl border border-white/10 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  form="merchant-company-form"
                  disabled={isSaving}
                  className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-violet-600/20 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      Speichert...
                    </>
                  ) : (
                    'Speichern'
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

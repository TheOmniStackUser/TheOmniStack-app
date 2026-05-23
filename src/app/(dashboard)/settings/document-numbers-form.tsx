'use client'

import { useActionState, useState, useEffect } from 'react'
import { saveDocumentNumberSettingsAction } from '@/app/actions/settings'
import { CollapsibleSection } from '@/components/collapsible-section'
import { Settings, HelpCircle, Check, Info } from 'lucide-react'
import type { Company } from '@/db/schema/companies'

interface DocumentTypeConfig {
  auto: boolean
  next: string
  format: string
  padding: number
  perContact: boolean
}

interface DocumentNumberSettings {
  invoice?: DocumentTypeConfig
  quote?: DocumentTypeConfig
  creditNote?: DocumentTypeConfig
  deliveryNote?: DocumentTypeConfig
  purchaseOrder?: DocumentTypeConfig
}

function getCalendarWeek(d: Date): number {
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7)
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
}

function resolvePreview(format: string, next: string, padding: number): string {
  const date = new Date()
  const year = date.getFullYear().toString()
  const yearShort = year.substring(2)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const week = getCalendarWeek(date).toString().padStart(2, '0')
  
  const nextNum = parseInt(next, 10) || 1
  const numStr = nextNum.toString().padStart(padding || 1, '0')

  return format
    .replace(/%jahr%/g, year)
    .replace(/%jahr_kurz%/g, yearShort)
    .replace(/%monat%/g, month)
    .replace(/%woche%/g, week)
    .replace(/%tag%/g, day)
    .replace(/%kunde%/g, '13001')
    .replace(/%lieferant%/g, '50021')
    .replace(/%nummer%/g, numStr)
}

export function DocumentNumbersForm({ company }: { company: Company }) {
  const [state, action, isPending] = useActionState(saveDocumentNumberSettingsAction, undefined)
  const [isOpen, setIsOpen] = useState(false)

  // Retrieve stored settings or fall back to defaults
  const dbSettings = (company.documentNumberSettings as DocumentNumberSettings) || {}

  // Local state for each type to enable live preview and interactive placeholder insertions
  const [invoiceAuto, setInvoiceAuto] = useState(dbSettings.invoice?.auto ?? true)
  const [invoiceNext, setInvoiceNext] = useState(dbSettings.invoice?.next ?? company.nextInvoiceNumber ?? '1')
  const [invoiceFormat, setInvoiceFormat] = useState(dbSettings.invoice?.format ?? '%jahr%%nummer%')
  const [invoicePadding, setInvoicePadding] = useState(dbSettings.invoice?.padding ?? 5)
  const [invoicePerContact, setInvoicePerContact] = useState(dbSettings.invoice?.perContact ?? false)

  const [quoteAuto, setQuoteAuto] = useState(dbSettings.quote?.auto ?? true)
  const [quoteNext, setQuoteNext] = useState(dbSettings.quote?.next ?? '10001')
  const [quoteFormat, setQuoteFormat] = useState(dbSettings.quote?.format ?? '%nummer%')
  const [quotePadding, setQuotePadding] = useState(dbSettings.quote?.padding ?? 5)
  const [quotePerContact, setQuotePerContact] = useState(dbSettings.quote?.perContact ?? false)

  const [creditNoteAuto, setCreditNoteAuto] = useState(dbSettings.creditNote?.auto ?? true)
  const [creditNoteNext, setCreditNoteNext] = useState(dbSettings.creditNote?.next ?? '10001')
  const [creditNoteFormat, setCreditNoteFormat] = useState(dbSettings.creditNote?.format ?? '%nummer%')
  const [creditNotePadding, setCreditNotePadding] = useState(dbSettings.creditNote?.padding ?? 5)
  const [creditNotePerContact, setCreditNotePerContact] = useState(dbSettings.creditNote?.perContact ?? false)

  const [deliveryNoteAuto, setDeliveryNoteAuto] = useState(dbSettings.deliveryNote?.auto ?? true)
  const [deliveryNoteNext, setDeliveryNoteNext] = useState(dbSettings.deliveryNote?.next ?? company.nextDeliveryNoteNumber ?? '1')
  const [deliveryNoteFormat, setDeliveryNoteFormat] = useState(dbSettings.deliveryNote?.format ?? '%nummer%')
  const [deliveryNotePadding, setDeliveryNotePadding] = useState(dbSettings.deliveryNote?.padding ?? 5)
  const [deliveryNotePerContact, setDeliveryNotePerContact] = useState(dbSettings.deliveryNote?.perContact ?? false)

  const [purchaseOrderAuto, setPurchaseOrderAuto] = useState(dbSettings.purchaseOrder?.auto ?? true)
  const [purchaseOrderNext, setPurchaseOrderNext] = useState(dbSettings.purchaseOrder?.next ?? '10001')
  const [purchaseOrderFormat, setPurchaseOrderFormat] = useState(dbSettings.purchaseOrder?.format ?? '%nummer%')
  const [purchaseOrderPadding, setPurchaseOrderPadding] = useState(dbSettings.purchaseOrder?.padding ?? 5)
  const [purchaseOrderPerContact, setPurchaseOrderPerContact] = useState(dbSettings.purchaseOrder?.perContact ?? false)

  const appendPlaceholder = (type: string, placeholder: string) => {
    switch (type) {
      case 'invoice':
        setInvoiceFormat(prev => prev + placeholder)
        break
      case 'quote':
        setQuoteFormat(prev => prev + placeholder)
        break
      case 'creditNote':
        setCreditNoteFormat(prev => prev + placeholder)
        break
      case 'deliveryNote':
        setDeliveryNoteFormat(prev => prev + placeholder)
        break
      case 'purchaseOrder':
        setPurchaseOrderFormat(prev => prev + placeholder)
        break
    }
  }

  const placeholders = [
    { key: '%nummer%', label: 'Laufende Nummer', color: 'bg-amber-50 text-amber-800 border-amber-200' },
    { key: '%jahr%', label: 'Jahr (4-stellig)', color: 'bg-blue-50 text-blue-800 border-blue-200' },
    { key: '%jahr_kurz%', label: 'Jahr (2-stellig)', color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
    { key: '%monat%', label: 'Monat', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    { key: '%woche%', label: 'Kalenderwoche', color: 'bg-purple-50 text-purple-800 border-purple-200' },
    { key: '%tag%', label: 'Tag', color: 'bg-pink-50 text-pink-800 border-pink-200' },
    { key: '%kunde%', label: 'Kunde (Nr)', color: 'bg-teal-50 text-teal-800 border-teal-200' },
    { key: '%lieferant%', label: 'Lieferant (Nr)', color: 'bg-orange-50 text-orange-800 border-orange-200' },
  ]

  const docTypes = [
    {
      key: 'invoice' as const,
      label: 'Rechnung',
      numberLabel: 'Nächste Rechnungsnummer',
      auto: invoiceAuto,
      setAuto: setInvoiceAuto,
      next: invoiceNext,
      setNext: setInvoiceNext,
      format: invoiceFormat,
      setFormat: setInvoiceFormat,
      padding: invoicePadding,
      setPadding: setInvoicePadding,
      perContact: invoicePerContact,
      setPerContact: setInvoicePerContact,
    },
    {
      key: 'quote' as const,
      label: 'Angebot',
      numberLabel: 'Nächste Angebotsnummer',
      auto: quoteAuto,
      setAuto: setQuoteAuto,
      next: quoteNext,
      setNext: setQuoteNext,
      format: quoteFormat,
      setFormat: setQuoteFormat,
      padding: quotePadding,
      setPadding: setQuotePadding,
      perContact: quotePerContact,
      setPerContact: setQuotePerContact,
    },
    {
      key: 'creditNote' as const,
      label: 'Gutschrift',
      numberLabel: 'Nächste Gutschriftsnummer',
      auto: creditNoteAuto,
      setAuto: setCreditNoteAuto,
      next: creditNoteNext,
      setNext: setCreditNoteNext,
      format: creditNoteFormat,
      setFormat: setCreditNoteFormat,
      padding: creditNotePadding,
      setPadding: setCreditNotePadding,
      perContact: creditNotePerContact,
      setPerContact: setCreditNotePerContact,
    },
    {
      key: 'deliveryNote' as const,
      label: 'Lieferschein',
      numberLabel: 'Nächste Lieferscheinnummer',
      auto: deliveryNoteAuto,
      setAuto: setDeliveryNoteAuto,
      next: deliveryNoteNext,
      setNext: setDeliveryNoteNext,
      format: deliveryNoteFormat,
      setFormat: setDeliveryNoteFormat,
      padding: deliveryNotePadding,
      setPadding: setDeliveryNotePadding,
      perContact: deliveryNotePerContact,
      setPerContact: setDeliveryNotePerContact,
    },
    {
      key: 'purchaseOrder' as const,
      label: 'Bestellung',
      numberLabel: 'Nächste Bestellnummer',
      auto: purchaseOrderAuto,
      setAuto: setPurchaseOrderAuto,
      next: purchaseOrderNext,
      setNext: setPurchaseOrderNext,
      format: purchaseOrderFormat,
      setFormat: setPurchaseOrderFormat,
      padding: purchaseOrderPadding,
      setPadding: setPurchaseOrderPadding,
      perContact: purchaseOrderPerContact,
      setPerContact: setPurchaseOrderPerContact,
    }
  ]

  return (
    <CollapsibleSection
      title="Dokumentennummern"
      subtitle="Konfiguriere automatische Nummernkreise und Formatvorlagen für Belege."
      icon={
        <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100">
          <Settings className="text-gray-500 w-6 h-6" />
        </div>
      }
      headerClassName="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 bg-gray-50/50 transition-colors select-none"
      isOpen={isOpen}
      onToggle={(open) => setIsOpen(open)}
    >
      <div className="p-6 space-y-8 bg-gray-50/30">
        
        {/* --- PLACEHOLDER LEGEND --- */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-gray-900">Platzhalter für Belegnummern</h4>
              <p className="text-sm text-gray-500 mt-1">
                Du kannst Platzhalter verwenden, um deine Dokumentennummern dynamisch zu strukturieren. Diese werden beim Finalisieren des Dokuments automatisch ersetzt.
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
            {placeholders.map((ph) => (
              <div 
                key={ph.key} 
                className={`p-3 rounded-xl border text-xs flex flex-col gap-1 transition-all ${ph.color}`}
              >
                <code className="font-bold text-sm tracking-wider">{ph.key}</code>
                <span className="opacity-90">{ph.label}</span>
              </div>
            ))}
          </div>

          <div className="p-4 bg-gray-50 rounded-xl text-xs text-gray-600 flex flex-col gap-1 border border-gray-100">
            <span>
              <strong>Beispiel:</strong> Format <code className="bg-white px-1.5 py-0.5 rounded border font-mono">%jahr%-%kunde%-%nummer%</code> 
              ergibt z.B. <code className="bg-white px-1.5 py-0.5 rounded border font-mono">2026-13001-10001</code>
            </span>
            <span className="text-amber-700 mt-1">
              <strong>Hinweis zu Kundenfiltern:</strong> Für Kundennummern verwenden wir standardmäßig <code className="font-mono">13001</code> und für Lieferanten <code className="font-mono">50021</code> in dieser Vorschau.
            </span>
          </div>
        </div>

        <form action={action} className="space-y-6">
          {/* Render inputs for each type */}
          <div className="space-y-6">
            {docTypes.map((type) => {
              const previewValue = resolvePreview(type.format, type.next, type.padding)
              return (
                <div 
                  key={type.key} 
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5 transition-all hover:shadow-md hover:border-gray-300"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                    <h4 className="text-lg font-bold text-gray-900">{type.label}</h4>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          name={`${type.key}_auto`}
                          checked={type.auto}
                          onChange={(e) => type.setAuto(e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Nummer automatisch vergeben</span>
                      </label>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                        empfohlen
                      </span>
                    </div>
                  </div>

                  {type.auto && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      
                      {/* Next Number */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          {type.numberLabel}
                        </label>
                        <input
                          type="text"
                          name={`${type.key}_next`}
                          value={type.next}
                          onChange={(e) => type.setNext(e.target.value.replace(/[^0-9]/g, ''))}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 font-mono"
                          required
                        />
                        <p className="text-xs text-gray-400">Nummer wird fortlaufend hochgezählt.</p>
                      </div>

                      {/* Format */}
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Formatierung
                        </label>
                        <input
                          type="text"
                          name={`${type.key}_format`}
                          value={type.format}
                          onChange={(e) => type.setFormat(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 font-mono"
                          placeholder="%nummer%"
                          required
                        />
                        
                        {/* Quick Add Placeholder Badges */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <span className="text-xs text-gray-400 self-center mr-1">Platzhalter:</span>
                          {placeholders.map((ph) => (
                            <button
                              key={ph.key}
                              type="button"
                              onClick={() => appendPlaceholder(type.key, ph.key)}
                              className="px-2 py-0.5 rounded text-[10px] font-mono border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
                            >
                              {ph.key}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Padding (Stellen) */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Stellen
                        </label>
                        <input
                          type="number"
                          name={`${type.key}_padding`}
                          value={type.padding}
                          onChange={(e) => type.setPadding(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 font-mono"
                          min={1}
                          required
                        />
                        <p className="text-xs text-gray-400">Mindestlänge der laufenden Nummer.</p>
                      </div>

                      {/* Live Preview Bar */}
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Live-Vorschau (Aktuelles Datum)
                        </label>
                        <div className="w-full px-4 py-2.5 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center font-mono text-sm text-blue-800">
                          <span className="font-bold mr-2 text-blue-500 text-xs uppercase tracking-wider">Vorschau:</span>
                          <span className="font-bold tracking-wider">{previewValue}</span>
                        </div>
                      </div>

                      {/* Per Contact Checkbox */}
                      <div className="md:col-span-3 pt-2">
                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            name={`${type.key}_perContact`}
                            checked={type.perContact}
                            onChange={(e) => type.setPerContact(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-0.5"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                              Für jeden Kontakt separat hochzählen
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                Nicht empfohlen
                              </span>
                            </span>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Startet die laufende Nummer jeweils kontaktbezogen bei &quot;1&quot;. Davon raten wir aus steuerlichen Gründen ab.
                            </p>
                          </div>
                        </label>
                      </div>

                    </div>
                  )}

                  {!type.auto && (
                    <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-600">
                      Belegnummern werden nicht automatisch vergeben. Beim Erstellen wird ein Eingabefeld zur manuellen Nummerneingabe angezeigt.
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* --- Submit Button --- */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col sm:flex-row items-center gap-4">
            <button
              type="submit"
              disabled={isPending}
              className={`px-8 py-3 rounded-2xl font-bold text-white shadow-lg transition-all cursor-pointer ${
                isPending ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/30'
              }`}
            >
              {isPending ? 'Speichert...' : 'Dokumentennummern speichern'}
            </button>

            {state?.message && (
              <div className={`text-sm font-medium px-4 py-2 rounded-xl flex items-center gap-2 ${
                state.success ? 'text-green-600 bg-green-50 border border-green-100' : 'text-red-600 bg-red-50 border border-red-100'
              }`}>
                {state.success && <Check className="w-4 h-4" />}
                {state.message}
              </div>
            )}
          </div>
        </form>
        
      </div>
    </CollapsibleSection>
  )
}

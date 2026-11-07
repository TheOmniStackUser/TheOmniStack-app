'use client'

import { useState, useTransition } from 'react'
import { CalendarClock, Check, Loader2, X, AlertCircle, Store, Info, ShieldCheck } from 'lucide-react'
import { savePreorderMarketplaceConfig } from '@/app/actions/products'

export type PreorderIntegrationItem = {
  id: string
  type: string
  metadata?: any
}

function getMarketplaceDisplayName(integration: PreorderIntegrationItem) {
  if (integration.type === 'mirakl_custom' && integration.metadata?.customName) {
    return integration.metadata.customName
  }
  const names: Record<string, string> = {
    amazon: 'Amazon',
    otto: 'Otto Market',
    shopify: 'Shopify',
    aboutyou: 'About You',
    kaufland: 'Kaufland',
    ebay: 'eBay',
    woocommerce: 'WooCommerce',
    shopware: 'Shopware',
    mirakl_decathlon: 'Decathlon',
    mirakl_decathlon_eu: 'Decathlon EU',
    mirakl_mediamarkt: 'MediaMarkt',
    mirakl_custom: 'Custom Mirakl',
  }
  return names[integration.type] || integration.type
}

interface PreorderSetupModalProps {
  isOpen: boolean
  onClose: () => void
  integrations: PreorderIntegrationItem[]
  onToast?: (message: string, type: 'success' | 'error' | 'info') => void
}

export function PreorderSetupModal({
  isOpen,
  onClose,
  integrations,
  onToast,
}: PreorderSetupModalProps) {
  const [config, setConfig] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    integrations.forEach((int) => {
      initial[int.id] = !!int.metadata?.productSync?.allowPreorder
    })
    return initial
  })

  const [syncImmediately, setSyncImmediately] = useState(true)
  const [isPending, startTransition] = useTransition()

  if (!isOpen) return null

  const handleToggle = (integrationId: string) => {
    setConfig((prev) => ({
      ...prev,
      [integrationId]: !prev[integrationId],
    }))
  }

  const handleSave = () => {
    startTransition(async () => {
      try {
        const payload = Object.entries(config).map(([integrationId, allowPreorder]) => ({
          integrationId,
          allowPreorder,
        }))

        await savePreorderMarketplaceConfig(payload, syncImmediately)
        onToast?.('Vorbestellungs-Einstellungen erfolgreich gespeichert', 'success')
        onClose()
      } catch (err: any) {
        console.error('Failed to save preorder settings:', err)
        onToast?.(err.message || 'Fehler beim Speichern der Vorbestellungs-Konfiguration', 'error')
      }
    })
  }

  const enabledCount = Object.values(config).filter(Boolean).length

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200/80 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent border-b border-slate-100 flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <CalendarClock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">
                Vorbestellungen konfigurieren
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Marktplätze mit manueller Lieferzeitanpassung für Vorbesteller freigeben
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Information Notice */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 flex gap-3.5 text-slate-900">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed space-y-1.5 text-slate-700">
              <p className="font-bold text-slate-900">
                Funktionsweise der Vorbestellung (Pre-Order):
              </p>
              <p>
                Wird bei einem Produkt der Haken <strong className="text-amber-800">Vorbestellung</strong> aktiviert,
                überträgt TheOmniStack den echten Lagerbestand (z.&thinsp;B. 5 Stück) <strong>ausschließlich</strong> an
                die hier aktivierten Marktplätze, bei denen Sie die Lieferzeit manuell im jeweiligen Verkäuferportal
                verlängert haben.
              </p>
              <p>
                Alle anderen Marktplätze erhalten automatisch den <strong>Bestand 0</strong>, um Stornos durch
                Lieferverzug zu verhindern.
              </p>
            </div>
          </div>

          {/* Marketplace List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Angebundene Marktplätze ({integrations.length})
              </span>
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/60">
                {enabledCount} von {integrations.length} für Vorbestellung aktiv
              </span>
            </div>

            {integrations.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-500 text-sm">
                Keine aktiven Marktplatz-Integrationen gefunden.
              </div>
            ) : (
              <div className="space-y-2.5">
                {integrations.map((integration) => {
                  const isChecked = !!config[integration.id]
                  const name = getMarketplaceDisplayName(integration)

                  return (
                    <div
                      key={integration.id}
                      onClick={() => handleToggle(integration.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                        isChecked
                          ? 'bg-amber-50/40 border-amber-300 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                            isChecked
                              ? 'bg-amber-500 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Store className="w-5 h-5" />
                        </div>
                        <div className="truncate">
                          <p className="font-bold text-slate-900 text-sm truncate flex items-center gap-2">
                            {name}
                            {isChecked && (
                              <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200">
                                Vorbestellung Aktiv
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {isChecked
                              ? 'Echter Lagerbestand wird übertragen (Lieferzeit manuell im Portal anpassen)'
                              : 'Bestand 0 wird übertragen bei Vorbesteller-Produkten'}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggle(integration.id)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Sync Checkbox */}
          <div className="pt-2">
            <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/70 transition-colors">
              <input
                type="checkbox"
                checked={syncImmediately}
                onChange={(e) => setSyncImmediately(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <span className="text-xs font-semibold text-slate-700">
                Aktive Vorbesteller-Produkte sofort mit den geänderten Einstellungen an die Marktplätze synchronisieren
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-bold shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Wird gespeichert...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Einstellungen speichern
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

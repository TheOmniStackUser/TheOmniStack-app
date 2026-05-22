'use client'

import { useState } from 'react'
import { saveMarketplaceAutomationAction } from '@/app/actions/settings'
import { RefreshCw, CheckCircle2, CloudUpload, Download } from 'lucide-react'
import { CollapsibleSection } from '@/components/collapsible-section'

type Integration = {
  id: string
  type: string
  autoInvoice: boolean
  uploadInvoice: boolean
  metadata?: unknown
}

export function MarketplaceAutomation({ integrations }: { integrations: Integration[] }) {
  const [localIntegrations, setLocalIntegrations] = useState<Integration[]>(integrations)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [prevIntegrations, setPrevIntegrations] = useState<Integration[]>(integrations)

  // Sync state if integrations prop updates from page reload/revalidation
  if (prevIntegrations !== integrations) {
    setPrevIntegrations(integrations)
    setLocalIntegrations(integrations)
  }

  // Filter out shipping providers and sort (Otto & About You at the bottom)
  const marketplaceIntegrations = localIntegrations
    .filter(i => !['dhl', 'hermes'].includes(i.type))
    .sort((a, b) => {
      if (['otto', 'aboutyou'].includes(a.type) && !['otto', 'aboutyou'].includes(b.type)) return 1
      if (!['otto', 'aboutyou'].includes(a.type) && ['otto', 'aboutyou'].includes(b.type)) return -1
      return 0
    })

  const handleToggle = async (id: string, field: 'autoInvoice' | 'uploadInvoice' | 'downloadInvoice', currentVal: boolean) => {
    const newVal = !currentVal

    // Optimistically update local state immediately
    setLocalIntegrations(prev => prev.map(int => {
      if (int.id === id) {
        if (field === 'downloadInvoice') {
          const currentMetadata = (int.metadata as Record<string, unknown>) || {}
          return {
            ...int,
            metadata: {
              ...currentMetadata,
              downloadInvoice: newVal
            }
          }
        } else {
          return {
            ...int,
            [field]: newVal
          }
        }
      }
      return int
    }))

    setLoadingId(`${id}-${field}`)

    // Find in current state for sending accurate payload
    const integration = localIntegrations.find(i => i.id === id)
    if (!integration) {
      setLoadingId(null)
      return
    }

    const result = await saveMarketplaceAutomationAction(
      id,
      field === 'autoInvoice' ? newVal : integration.autoInvoice,
      field === 'uploadInvoice' ? newVal : integration.uploadInvoice,
      field === 'downloadInvoice' ? newVal : !!(integration.metadata as Record<string, unknown>)?.downloadInvoice
    )

    if (!result.success) {
      // Revert optimistic state on failure
      setLocalIntegrations(prev => prev.map(int => {
        if (int.id === id) {
          if (field === 'downloadInvoice') {
            const currentMetadata = (int.metadata as Record<string, unknown>) || {}
            return {
              ...int,
              metadata: {
                ...currentMetadata,
                downloadInvoice: currentVal
              }
            }
          } else {
            return {
              ...int,
              [field]: currentVal
            }
          }
        }
        return int
      }))
      alert(result.message)
    }
    setLoadingId(null)
  }

  const getLabel = (type: string) => {
    const labels: Record<string, string> = {
      'amazon': 'Amazon SP-API',
      'otto': 'Otto Market',
      'mirakl_decathlon': 'Decathlon (Mirakl)',
      'mirakl_decathlon_eu': 'Decathlon EU (Mirakl)',
      'mirakl_mediamarkt': 'MediaMarkt (Mirakl)',
      'shopify': 'Shopify',
      'aboutyou': 'About You',
    }
    return labels[type] || type
  }

  return (
    <CollapsibleSection
      title="Marktplatz-Automatisierung"
      subtitle="Hier kannst du festlegen, ob bei neuen Bestellungen automatisch eine Rechnung erstellt werden soll. Einige Marktplätze (wie Amazon) erlauben den automatischen Upload der PDF-Rechnung, während andere (wie Otto) ausschließlich eigene Rechnungen verwenden."
      icon={
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
          <RefreshCw className="text-blue-600 w-6 h-6" />
        </div>
      }
      headerClassName="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 bg-gray-50/50 transition-colors select-none"
      defaultOpen={false}
    >
      <div className="p-6">
        {marketplaceIntegrations.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-gray-400 text-sm">Keine Marktplatz-Integrationen gefunden.</p>
            <p className="text-xs text-gray-400 mt-1">Verknüpfe erst einen Marktplatz unter &quot;Integrationen&quot;.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {marketplaceIntegrations.map((int) => {
              const cannotCreateInvoice = int.type === 'otto' || int.type === 'aboutyou'
              const downloadInvoice = !!(int.metadata as Record<string, unknown>)?.downloadInvoice
              
              return (
                <div key={int.id} className="p-5 rounded-2xl border border-gray-100 bg-gray-50/30 flex flex-col lg:row md:flex-row md:items-center justify-between gap-6 transition-all hover:bg-gray-50/50">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                      {int.type === 'amazon' ? (
                        <span className="font-bold text-orange-500 text-xs">AMZ</span>
                      ) : int.type === 'otto' ? (
                        <span className="font-bold text-red-500 text-xs">OTTO</span>
                      ) : int.type === 'aboutyou' ? (
                        <span className="font-bold text-black text-xs">AY</span>
                      ) : (
                        <RefreshCw className="text-blue-500 w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 leading-tight">{getLabel(int.type)}</h4>
                      <p className="text-[10px] text-gray-400 font-mono mt-1 uppercase tracking-wider">ID: {int.id.slice(0, 8)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    {cannotCreateInvoice && (
                      <div className="px-3 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-lg border border-amber-200 uppercase tracking-tight">
                        {getLabel(int.type)} erstellt eigene Rechnungen
                      </div>
                    )}

                    <div className="flex gap-2">
                      {cannotCreateInvoice && (
                        <button
                          onClick={() => handleToggle(int.id, 'downloadInvoice', downloadInvoice)}
                          disabled={loadingId === `${int.id}-downloadInvoice`}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                            downloadInvoice 
                              ? 'bg-green-600 border-green-600 text-white shadow-md shadow-green-200' 
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          <Download size={14} />
                          {loadingId === `${int.id}-downloadInvoice` ? '...' : 'Auto-Download'}
                        </button>
                      )}

                      <button
                        onClick={() => handleToggle(int.id, 'autoInvoice', int.autoInvoice)}
                        disabled={loadingId === `${int.id}-autoInvoice` || cannotCreateInvoice}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                          int.autoInvoice 
                            ? 'bg-green-600 border-green-600 text-white shadow-md shadow-green-200' 
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        } ${cannotCreateInvoice ? 'opacity-40 cursor-not-allowed grayscale' : ''}`}
                      >
                        <CheckCircle2 size={14} />
                        {loadingId === `${int.id}-autoInvoice` ? '...' : 'Auto-Rechnung'}
                      </button>

                      <button
                        onClick={() => handleToggle(int.id, 'uploadInvoice', int.uploadInvoice)}
                        disabled={loadingId === `${int.id}-uploadInvoice` || cannotCreateInvoice}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                          int.uploadInvoice 
                            ? 'bg-green-600 border-green-600 text-white shadow-md shadow-green-200' 
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        } ${cannotCreateInvoice ? 'opacity-40 cursor-not-allowed grayscale' : ''}`}
                      >
                        <CloudUpload size={14} />
                        {loadingId === `${int.id}-uploadInvoice` ? '...' : 'Auto-Upload'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}

'use client'

import { useState, useMemo } from 'react'
import { Database, Search, Filter, Loader2, CheckSquare, Square, X, Info, AlertTriangle, Trash2, Download } from 'lucide-react'
import { bulkCreateProductsFromUnmapped, deleteUnmappedProducts } from '@/app/actions/products'
import { useRouter } from 'next/navigation'
import { UnmappedMarketplaceProduct } from '@/db/schema/products'
import { AlertModal } from '@/components/alert-modal'

interface UnmappedClientProps {
  unmappedProducts: UnmappedMarketplaceProduct[]
  marketplaces: any[]
}

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col animate-in zoom-in-95 duration-200 relative" 
        style={{ maxHeight: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl shrink-0">
          <h3 className="font-bold text-slate-900 text-lg">{title}</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto custom-scrollbar shrink">
          <div className="p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

const PayloadViewer = ({ payload }: { payload: any }) => {
  if (!payload || typeof payload !== 'object') return <p className="text-slate-500 text-sm">Keine Daten verfügbar</p>

  const renderValue = (val: any): React.ReactNode => {
    if (val === null) return <span className="text-slate-400 italic text-xs bg-slate-100 px-2 py-0.5 rounded">null</span>;
    if (typeof val === 'boolean') return <span className={`text-xs font-bold px-2 py-0.5 rounded ${val ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{val ? 'Ja' : 'Nein'}</span>;
    if (typeof val === 'number') return <span className="font-mono text-slate-700 font-medium">{val}</span>;
    if (typeof val === 'string') return <span className="text-slate-700">{val}</span>;
    
    if (Array.isArray(val)) {
      if (val.length === 0) return <span className="text-slate-400 text-xs">Leer</span>;
      return (
        <div className="flex flex-col gap-2 mt-1">
          {val.map((item, i) => (
            <div key={i} className="pl-3 border-l-2 border-indigo-100">
              {renderValue(item)}
            </div>
          ))}
        </div>
      );
    }
    
    if (typeof val === 'object') {
      return (
        <div className="flex flex-col gap-2 w-full mt-1">
          {Object.entries(val).map(([k, v]) => (
            <div key={k} className="bg-white rounded-lg p-3 border border-slate-100 shadow-sm">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{k.replace(/_/g, ' ')}</div>
              <div>{renderValue(v)}</div>
            </div>
          ))}
        </div>
      );
    }
    
    return <span>{String(val)}</span>;
  };

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="divide-y divide-slate-200/60">
        {Object.entries(payload).map(([key, value]) => (
          <div key={key} className="flex flex-col md:flex-row md:items-start p-4 hover:bg-white transition-colors">
            <div className="md:w-1/3 mb-2 md:mb-0">
              <span className="inline-flex items-center text-[11px] font-bold text-slate-600 uppercase tracking-wider bg-slate-200/50 px-2.5 py-1 rounded-md">
                {key.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="md:w-2/3 flex items-start break-words overflow-hidden text-sm">
              {renderValue(value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const getEanFromPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null;
  
  if (Array.isArray(payload.product_references)) {
    const eanRef = payload.product_references.find((r: any) => 
      r.reference_type === 'UC_EAN' || r.reference_type === 'EAN' || r.reference_type === 'UPC'
    );
    if (eanRef && eanRef.reference) return eanRef.reference;
  }
  
  if (payload.barcode) return payload.barcode;
  if (payload.variants && Array.isArray(payload.variants) && payload.variants.length > 0 && payload.variants[0].barcode) {
    return payload.variants[0].barcode;
  }

  if (payload.ean) return payload.ean;
  if (payload.gtin) return payload.gtin;

  return null;
};

export function UnmappedClient({ unmappedProducts, marketplaces }: UnmappedClientProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [detailsProduct, setDetailsProduct] = useState<UnmappedMarketplaceProduct | null>(null)
  const [alertState, setAlertState] = useState<{ isOpen: boolean; title?: string; message: string }>({ isOpen: false, message: '' })
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean, type: 'single' | 'bulk', id?: string }>({ isOpen: false, type: 'single' })

  const showAlert = (message: string, title?: string) => {
    setAlertState({ isOpen: true, message, title })
  }

  const hideAlert = () => {
    setAlertState(prev => ({ ...prev, isOpen: false }))
  }

  const getMarketplaceDisplayName = (type: string) => {
    const integration = marketplaces.find(m => m.type === type)
    if (integration && (integration.metadata as any)?.customName) {
      return (integration.metadata as any).customName
    }
    const displayMap: Record<string, string> = {
      mirakl_decathlon: 'Decathlon',
      mirakl_decathlon_eu: 'Decathlon EU',
      mirakl_mediamarkt: 'MediaMarkt',
      mirakl_custom: 'Custom Mirakl',
      aboutyou: 'About You',
      kaufland: 'Kaufland',
      otto: 'OTTO',
      amazon: 'Amazon',
      shopify: 'Shopify',
      woocommerce: 'WooCommerce',
      shopware: 'Shopware',
      ebay: 'eBay',
    }
    return displayMap[type] || type
  }

  // Get unique marketplaces for the filter dropdown
  const uniqueMarketplaces = useMemo(() => {
    const types = new Set(unmappedProducts.map(p => p.marketplace))
    return Array.from(types).map(type => ({
      type,
      name: getMarketplaceDisplayName(type)
    }))
  }, [unmappedProducts, marketplaces])

  const filteredProducts = useMemo(() => {
    return unmappedProducts.filter(p => {
      // Filter by marketplace
      if (marketplaceFilter !== 'all' && p.marketplace !== marketplaceFilter) return false
      
      // Filter by search (title or sku)
      if (search) {
        const q = search.toLowerCase()
        const matchTitle = p.title.toLowerCase().includes(q)
        const matchSku = p.marketplaceSku.toLowerCase().includes(q)
        if (!matchTitle && !matchSku) return false
      }
      return true
    })
  }, [unmappedProducts, search, marketplaceFilter])

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const handleBulkCreate = async () => {
    if (selectedIds.size === 0) return
    setIsSubmitting(true)
    try {
      await bulkCreateProductsFromUnmapped(Array.from(selectedIds))
      setSelectedIds(new Set())
      router.refresh()
    } catch (error) {
      console.error(error)
      showAlert('Fehler beim Anlegen der Produkte', 'Fehler')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    setIsSubmitting(true)
    try {
      await deleteUnmappedProducts(Array.from(selectedIds))
      setSelectedIds(new Set())
      setDeleteConfirmation({ isOpen: false, type: 'single' })
      router.refresh()
    } catch (error) {
      console.error(error)
      showAlert('Fehler beim Löschen der Produkte', 'Fehler')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteSingle = async (id: string) => {
    setIsSubmitting(true)
    try {
      await deleteUnmappedProducts([id])
      setDeleteConfirmation({ isOpen: false, type: 'single' })
      router.refresh()
    } catch (error) {
      console.error(error)
      showAlert('Fehler beim Löschen des Produkts', 'Fehler')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateSingle = async (id: string) => {
    setIsSubmitting(true)
    try {
      await bulkCreateProductsFromUnmapped([id])
      router.refresh()
    } catch (error) {
      console.error(error)
      showAlert('Fehler beim Anlegen des Produkts', 'Fehler')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMapSingle = (id: string) => {
    showAlert('Die Mappen-Funktion (Suche nach bestehenden Produkten) wird in Kürze hinzugefügt. Bitte lege das Produkt vorerst neu an oder warte auf das Update.', 'Hinweis')
  }

  const handleExportCsv = () => {
    if (filteredProducts.length === 0) {
      showAlert('Es gibt keine Produkte zum Exportieren.', 'Hinweis')
      return
    }

    const headers = ['Marktplatz', 'SKU', 'Titel', 'Preis', 'Bestand']
    const csvContent = [
      headers.join(';'),
      ...filteredProducts.map(p => {
        const title = p.title ? `"${p.title.replace(/"/g, '""')}"` : '""'
        return `${getMarketplaceDisplayName(p.marketplace)};${p.marketplaceSku};${title};${p.price || 0};${p.stock || 0}`
      })
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `ungemappte_produkte_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleExportSingleProductCsv = (product: UnmappedMarketplaceProduct) => {
    const flattenObject = (obj: any, prefix = ''): Record<string, string> => {
      if (!obj || typeof obj !== 'object') return {}
      return Object.keys(obj).reduce((acc: any, k: string) => {
        const pre = prefix.length ? prefix + '.' : ''
        if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
          Object.assign(acc, flattenObject(obj[k], pre + k))
        } else {
          acc[pre + k] = Array.isArray(obj[k]) ? JSON.stringify(obj[k]) : String(obj[k] ?? '')
        }
        return acc
      }, {})
    }
    
    const flatRaw = flattenObject(product.rawPayload || {})
    
    const csvContent = [
      ['Feld', 'Wert'].join(','),
      `"Marktplatz","${(product.marketplace || '').replace(/"/g, '""')}"`,
      `"SKU","${(product.marketplaceSku || '').replace(/"/g, '""')}"`,
      `"Titel","${(product.title || '').replace(/"/g, '""')}"`,
      `"Preis","${product.price ?? ''}"`,
      `"Bestand","${product.stock ?? ''}"`,
      ...Object.entries(flatRaw).map(([k, v]) => `"${k.replace(/"/g, '""')}","${v.replace(/"/g, '""')}"`)
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `produkt_${product.marketplaceSku || 'export'}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <>
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mt-8">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-slate-400" />
            Ungemappte Marktplatz-Produkte
            <span className="ml-2 bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs font-bold">
              {filteredProducts.length}
            </span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">Diese Artikel wurden auf angebundenen Marktplätzen gefunden, sind aber noch keinem Stammprodukt zugewiesen.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Suche nach Name oder SKU..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 placeholder:text-slate-500 bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              className="w-full sm:w-auto border border-slate-200 rounded-lg text-sm py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 bg-white"
              value={marketplaceFilter}
              onChange={(e) => setMarketplaceFilter(e.target.value)}
            >
              <option value="all">Alle Marktplätze</option>
              {uniqueMarketplaces.map(m => (
                <option key={m.type} value={m.type}>{m.name}</option>
              ))}
            </select>
          </div>
          
          <button
            onClick={handleExportCsv}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all font-semibold shadow-sm text-sm ml-auto"
          >
            <Download className="w-4 h-4" />
            CSV Export
          </button>
        </div>

        {selectedIds.size > 0 && (
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
            <span className="text-indigo-800 text-sm font-semibold">
              {selectedIds.size} Produkte ausgewählt
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirmation({ isOpen: true, type: 'bulk' })}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-4 py-1.5 bg-white border border-rose-200 text-rose-600 text-sm font-semibold rounded-md hover:bg-rose-50 transition-all disabled:opacity-50 shadow-sm"
              >
                Löschen
              </button>
              <button
                onClick={handleBulkCreate}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-sm"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Ausgewählte als Neu anlegen
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {unmappedProducts.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center text-slate-500">
            <Database className="w-12 h-12 text-slate-200 mb-4" />
            <p className="text-lg font-semibold text-slate-700">Keine ungemappten Produkte</p>
            <p className="text-sm mt-1 max-w-sm">Starten Sie oben einen Import, um neue Produkte von Ihren Marktplätzen abzurufen.</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center text-slate-500">
            <Search className="w-8 h-8 text-slate-300 mb-4" />
            <p className="text-base font-medium text-slate-600">Keine Ergebnisse gefunden</p>
          </div>
        ) : (
          <div>
            <div className="px-6 py-3 bg-slate-50 flex items-center gap-4 border-b border-slate-100">
              <button onClick={toggleSelectAll} className="text-slate-400 hover:text-indigo-600 transition-colors focus:outline-none">
                {selectedIds.size > 0 && selectedIds.size === filteredProducts.length ? (
                  <CheckSquare className="w-5 h-5 text-indigo-600" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
              </button>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Alle auswählen</span>
            </div>
            {filteredProducts.map((p) => (
              <div key={p.id} onClick={() => setDetailsProduct(p)} className={`p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 transition-colors cursor-pointer ${selectedIds.has(p.id) ? 'bg-indigo-50/30' : 'hover:bg-slate-50/30'}`}>
                
                <div className="flex items-start gap-4 flex-1">
                  <button onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }} className="mt-1 focus:outline-none">
                    {selectedIds.has(p.id) ? (
                      <CheckSquare className="w-5 h-5 text-indigo-600" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-300 hover:text-indigo-400" />
                    )}
                  </button>
                  
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-md uppercase tracking-wider">
                        {getMarketplaceDisplayName(p.marketplace)}
                      </span>
                      <span className="font-mono text-sm font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {p.marketplaceSku}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">{p.title}</h3>
                    <div className="flex gap-4 mt-2 text-sm text-slate-500 font-medium">
                      <span>Preis: {p.price} €</span>
                      <span>Bestand: {p.stock}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 w-full lg:w-auto lg:pl-10 items-center">
                  <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmation({ isOpen: true, type: 'single', id: p.id }); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors focus:outline-none" title="Eintrag verwerfen">
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleMapSingle(p.id); }} className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all font-semibold shadow-sm text-sm">
                    Mappen
                  </button>
                  <button disabled={isSubmitting} onClick={(e) => { e.stopPropagation(); handleCreateSingle(p.id); }} className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg hover:from-emerald-400 hover:to-teal-400 transition-all font-semibold shadow-sm text-sm disabled:opacity-50">
                    Als Neu anlegen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={hideAlert}
        title={alertState.title}
        message={alertState.message}
      />
    </div>

      {/* Product Details Modal */}
      <Modal 
        isOpen={!!detailsProduct} 
        onClose={() => setDetailsProduct(null)} 
        title={detailsProduct ? `Produktdetails` : ''}
      >
        {detailsProduct && (() => {
          const ean = getEanFromPayload(detailsProduct.rawPayload);
          return (
          <div className="space-y-6 text-sm">
            <div className="flex items-center gap-3">
               <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-md uppercase tracking-wider">
                 {getMarketplaceDisplayName(detailsProduct.marketplace)}
               </span>
               <h2 className="text-xl font-bold text-slate-900">{detailsProduct.title}</h2>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
               <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col">
                 <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">SKU</p>
                 <p className="font-bold font-mono text-slate-900 text-base">{detailsProduct.marketplaceSku}</p>
               </div>
               {ean && (
                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col">
                   <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">EAN</p>
                   <p className="font-bold font-mono text-slate-900 text-base break-all">{ean}</p>
                 </div>
               )}
               {detailsProduct.marketplaceProductId && (
                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col">
                   <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Produkt ID</p>
                   <p className="font-bold font-mono text-slate-900 text-base">{detailsProduct.marketplaceProductId}</p>
                 </div>
               )}
               <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col">
                 <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Preis</p>
                 <p className="font-bold text-slate-900 text-base">{detailsProduct.price} €</p>
               </div>
               
               {/* Extract UVP & Category from raw payload for display */}
               {(() => {
                 const raw = detailsProduct.rawPayload as any;
                 const uvp = raw?.discount?.origin_price || raw?.origin_price || raw?.msrp;
                 const category = raw?.category_label || raw?.category || raw?.product_type;
                 
                 return (
                   <>
                     {uvp && (
                       <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col">
                         <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">UVP</p>
                         <p className="font-bold text-slate-900 text-base">{uvp} €</p>
                       </div>
                     )}
                     {category && (
                       <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col">
                         <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Kategorie</p>
                         <p className="font-bold text-slate-900 text-base">{category}</p>
                       </div>
                     )}
                   </>
                 );
               })()}

               <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col">
                 <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Bestand</p>
                 <p className="font-bold text-slate-900 text-base">{detailsProduct.stock}</p>
               </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-slate-900 flex items-center gap-2 text-base">
                  <Info className="w-5 h-5 text-indigo-500" />
                  Strukturierte Rohdaten (Payload)
                </h4>
                <button
                  onClick={() => handleExportSingleProductCsv(detailsProduct)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  CSV Export
                </button>
              </div>
              <PayloadViewer payload={detailsProduct.rawPayload} />
            </div>
          </div>
          )
        })()}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteConfirmation.isOpen} onClose={() => setDeleteConfirmation({ isOpen: false, type: 'single' })} title="Einträge löschen?">
        <div className="space-y-6 text-sm">
          <div className="flex items-center justify-center p-4">
            <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-rose-600" />
            </div>
          </div>
          <p className="text-center text-slate-600 text-base">
            Möchtest du {deleteConfirmation.type === 'bulk' ? `die ${selectedIds.size} ausgewählten Einträge` : 'diesen Eintrag'} wirklich löschen? Du kannst sie später durch einen erneuten Import wieder abrufen.
          </p>
          <div className="flex justify-center gap-3 pt-4 border-t border-slate-100">
            <button onClick={() => setDeleteConfirmation({ isOpen: false, type: 'single' })} className="px-6 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors" disabled={isSubmitting}>
              Abbrechen
            </button>
            <button onClick={() => deleteConfirmation.type === 'bulk' ? handleBulkDelete() : deleteConfirmation.id && handleDeleteSingle(deleteConfirmation.id)} className="px-6 py-2.5 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 shadow-sm shadow-rose-600/20 transition-all flex items-center gap-2" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Löschen'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}

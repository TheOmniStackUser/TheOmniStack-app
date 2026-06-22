'use client'

import { useState, useMemo, useEffect, useDeferredValue } from 'react'
import { Database, Search, Filter, Loader2, CheckSquare, Square, X, Info, AlertTriangle, Trash2, Download } from 'lucide-react'
import { bulkCreateProductsFromUnmapped, deleteUnmappedProducts, searchProducts, mapUnmappedProductToExisting, getSuggestedProducts, getAutoMappableProducts, bulkAutoMapProducts } from '@/app/actions/products'
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
  if (payload.EAN) return payload.EAN;
  if (payload.gtin) return payload.gtin;
  if (payload.GTIN) return payload.GTIN;

  return null;
};

export function UnmappedClient({ unmappedProducts, marketplaces }: UnmappedClientProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [detailsProduct, setDetailsProduct] = useState<UnmappedMarketplaceProduct | null>(null)
  const [alertState, setAlertState] = useState<{ isOpen: boolean; title?: string; message: string }>({ isOpen: false, message: '' })
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean, type: 'single' | 'bulk', id?: string }>({ isOpen: false, type: 'single' })
  const [mapConfirmation, setMapConfirmation] = useState<{ isOpen: boolean, products: UnmappedMarketplaceProduct[] }>({ isOpen: false, products: [] })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  
  const [autoMapState, setAutoMapState] = useState<{ isOpen: boolean, matches: any[], isLoading: boolean }>({ isOpen: false, matches: [], isLoading: false })
  const [autoMapOptions, setAutoMapOptions] = useState({ matchEan: true, matchSku: true })

  const filteredAutoMapMatches = useMemo(() => {
    return autoMapState.matches.filter(m => {
      if (m.matchReason === 'EAN' && !autoMapOptions.matchEan) return false
      if (m.matchReason === 'SKU' && !autoMapOptions.matchSku) return false
      return true
    })
  }, [autoMapState.matches, autoMapOptions])

  // Local state for optimistic updates
  const [localProducts, setLocalProducts] = useState(unmappedProducts)
  const deferredSearch = useDeferredValue(search)
  const [displayCount, setDisplayCount] = useState(50)

  useEffect(() => {
    if (!mapConfirmation.isOpen) {
      setSearchQuery('')
      setSearchResults([])
      setSelectedProductId(null)
      return
    }

    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setIsSearching(true)
        try {
          const results = await searchProducts(searchQuery)
          setSearchResults(results)
        } catch (e) {
          console.error(e)
        } finally {
          setIsSearching(false)
        }
      } else {
        setSearchResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, mapConfirmation.isOpen])

  useEffect(() => {
    setLocalProducts(unmappedProducts)
  }, [unmappedProducts])

  const hideAlert = () => setAlertState(prev => ({ ...prev, isOpen: false }))

  const showAlert = (message: string, title?: string) => {
    setAlertState({ isOpen: true, message, title })
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
    const types = new Set(localProducts.map(p => p.marketplace))
    return Array.from(types).map(type => ({
      type,
      name: getMarketplaceDisplayName(type)
    }))
  }, [localProducts, marketplaces])

  const enrichedProducts = useMemo(() => {
    return localProducts.map(p => ({
      ...p,
      parsedEan: getEanFromPayload(p.rawPayload)
    }))
  }, [localProducts])

  const filteredProducts = useMemo(() => {
    return enrichedProducts.filter(p => {
      // Filter by marketplace
      if (marketplaceFilter !== 'all' && p.marketplace !== marketplaceFilter) return false
      
      // Filter by search (title, sku, or ean)
      if (deferredSearch) {
        const terms = deferredSearch.toLowerCase().trim().split(/\s+/).filter(Boolean)
        for (const term of terms) {
          const matchTitle = p.title?.toLowerCase().includes(term) || false
          const matchSku = p.marketplaceSku?.toLowerCase().includes(term) || false
          const matchEan = p.parsedEan ? String(p.parsedEan).toLowerCase().includes(term) : false
          if (!matchTitle && !matchSku && !matchEan) return false
        }
      }
      return true
    })
  }, [enrichedProducts, deferredSearch, marketplaceFilter])

  useEffect(() => {
    setDisplayCount(50)
  }, [deferredSearch, marketplaceFilter])

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredProducts.map(p => p.id))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleBulkCreate = async () => {
    if (selectedIds.length === 0) return
    setIsSubmitting(true)
    try {
      await bulkCreateProductsFromUnmapped(selectedIds)
      setSelectedIds([])
      router.refresh()
    } catch (error) {
      console.error(error)
      showAlert('Fehler beim Anlegen der Produkte', 'Fehler')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    setIsSubmitting(true)
    try {
      await deleteUnmappedProducts(selectedIds)
      setSelectedIds([])
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

  const handleMapSingle = async (product: UnmappedMarketplaceProduct) => {
    setMapConfirmation({ isOpen: true, products: [product] })
    setSearchQuery(search)
    setIsLoadingSuggestions(true)
    setSuggestions([])
    try {
      const ean = getEanFromPayload(product.rawPayload)
      const sugs = await getSuggestedProducts(product.marketplaceSku, ean)
      setSuggestions(sugs)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoadingSuggestions(false)
    }
  }

  const handleMapBulk = async () => {
    if (selectedIds.length === 0) return
    const productsToMap = localProducts.filter(p => selectedIds.includes(p.id))
    setMapConfirmation({ isOpen: true, products: productsToMap })
    setSearchQuery(search)
    setIsLoadingSuggestions(true)
    setSuggestions([])
    try {
      const firstProduct = productsToMap[0]
      const ean = getEanFromPayload(firstProduct.rawPayload)
      const sugs = await getSuggestedProducts(firstProduct.marketplaceSku, ean)
      setSuggestions(sugs)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoadingSuggestions(false)
    }
  }

  const handleConfirmMap = async () => {
    if (mapConfirmation.products.length === 0 || !selectedProductId) return
    setIsSubmitting(true)
    try {
      await Promise.all(
        mapConfirmation.products.map(p => mapUnmappedProductToExisting(p.id, selectedProductId))
      )
      setMapConfirmation({ isOpen: false, products: [] })
      setSelectedIds([])
      router.refresh()
    } catch (error) {
      console.error(error)
      showAlert('Fehler beim Mappen der Produkte', 'Fehler')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateFromMapModal = async () => {
    if (mapConfirmation.products.length === 0) return
    setIsSubmitting(true)
    try {
      await bulkCreateProductsFromUnmapped(mapConfirmation.products.map(p => p.id))
      setMapConfirmation({ isOpen: false, products: [] })
      setSelectedIds([])
      router.refresh()
      showAlert(`${mapConfirmation.products.length > 1 ? mapConfirmation.products.length + ' Produkte wurden' : 'Produkt wurde'} erfolgreich neu angelegt.`, 'Erfolg')
    } catch (error) {
      console.error(error)
      showAlert('Fehler beim Anlegen der Produkte', 'Fehler')
    } finally {
      setIsSubmitting(false)
    }
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

  const handleOpenAutoMap = async () => {
    setAutoMapState({ isOpen: true, matches: [], isLoading: true })
    try {
      const matches = await getAutoMappableProducts()
      setAutoMapState({ isOpen: true, matches, isLoading: false })
    } catch (e) {
      console.error(e)
      setAutoMapState({ isOpen: false, matches: [], isLoading: false })
      showAlert('Fehler beim Suchen nach Auto-Map Vorschlägen.', 'Fehler')
    }
  }

  const handleConfirmAutoMap = async () => {
    if (filteredAutoMapMatches.length === 0) return
    setIsSubmitting(true)
    try {
      await bulkAutoMapProducts(filteredAutoMapMatches.map(m => ({
        unmappedId: m.unmappedId,
        matchedProductId: m.matchedProductId
      })))
      setAutoMapState({ isOpen: false, matches: [], isLoading: false })
      router.refresh()
      showAlert(`${filteredAutoMapMatches.length} Produkte wurden erfolgreich gemappt!`, 'Erfolg')
    } catch (e) {
      console.error(e)
      showAlert('Fehler beim Auto-Mappen der Produkte.', 'Fehler')
    } finally {
      setIsSubmitting(false)
    }
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
              placeholder="Suche nach Name, SKU oder EAN..."
              className="w-full pl-9 pr-10 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 placeholder:text-slate-500 bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            )}
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
          
          <div className="flex gap-2 w-full sm:w-auto ml-auto">
            <button
              onClick={handleOpenAutoMap}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 hover:border-indigo-300 transition-all font-semibold shadow-sm text-sm"
            >
              <CheckSquare className="w-4 h-4" />
              Auto-Map
            </button>
            <button
              onClick={handleExportCsv}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all font-semibold shadow-sm text-sm"
            >
              <Download className="w-4 h-4" />
              CSV Export
            </button>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
            <span className="text-indigo-800 text-sm font-semibold">
              {selectedIds.length} Produkte ausgewählt
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
                onClick={handleMapBulk}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-4 py-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-md hover:bg-slate-50 transition-all disabled:opacity-50 shadow-sm"
              >
                Ausgewählte mappen
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
            <div 
              className="px-6 py-3 bg-slate-50 flex items-center gap-4 border-b border-slate-100 cursor-pointer hover:bg-slate-100/50 transition-colors"
              onClick={toggleSelectAll}
            >
              <input 
                type="checkbox"
                checked={selectedIds.length > 0 && selectedIds.length === filteredProducts.length}
                onChange={toggleSelectAll}
                onClick={(e) => e.stopPropagation()}
                className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
              />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider select-none">Alle auswählen</span>
            </div>
            {filteredProducts.slice(0, displayCount).map((p) => (
              <div key={p.id} onClick={() => setDetailsProduct(p as any)} className={`p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 transition-colors cursor-pointer ${selectedIds.includes(p.id) ? 'bg-indigo-50/30' : 'hover:bg-slate-50/30'}`}>
                
                <div className="flex items-start gap-4 flex-1">
                  <div className="mt-1 flex items-center">
                    <input 
                      type="checkbox"
                      checked={selectedIds.includes(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                    />
                  </div>
                  
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
                  <button onClick={(e) => { e.stopPropagation(); handleMapSingle(p as any); }} className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all font-semibold shadow-sm text-sm">
                    Mappen
                  </button>
                  <button disabled={isSubmitting} onClick={(e) => { e.stopPropagation(); handleCreateSingle(p.id); }} className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg hover:from-emerald-400 hover:to-teal-400 transition-all font-semibold shadow-sm text-sm disabled:opacity-50">
                    Als Neu anlegen
                  </button>
                </div>
              </div>
            ))}
            {filteredProducts.length > displayCount && (
              <div className="p-6 text-center border-t border-slate-100 bg-slate-50/50">
                <button 
                  onClick={() => setDisplayCount(prev => prev + 50)} 
                  className="px-6 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Weitere anzeigen ({filteredProducts.length - displayCount} verbleibend)
                </button>
              </div>
            )}
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
               
               {/* Extract UVP, Category, & Brand from raw payload for display */}
               {(() => {
                 const raw = detailsProduct.rawPayload as any;
                 const uvp = raw?.discount?.origin_price || raw?.origin_price || raw?.msrp;
                 const category = raw?.category_label || raw?.category || raw?.product_type;
                 
                 let brand = null;
                 if (raw?.brand !== undefined && raw?.brand !== null) {
                    if (typeof raw.brand === 'string') brand = raw.brand;
                    else if (typeof raw.brand === 'number') brand = String(raw.brand);
                    else if (raw.brand.name) brand = String(raw.brand.name);
                 } else if (raw?.vendor) {
                    brand = String(raw.vendor);
                 } else if (raw?.product_brand) {
                    brand = String(raw.product_brand);
                 } else if (Array.isArray(raw?.attributes)) {
                    const brandAttr = raw.attributes.find((a: any) => a.name === 'Brand' || a.name === 'brand' || a.code === 'brand');
                    if (brandAttr && brandAttr.value) brand = String(brandAttr.value);
                 }
                 
                 return (
                   <>
                     {brand && (
                       <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col">
                         <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Marke / Brand</p>
                         <p className="font-bold text-slate-900 text-base">{brand}</p>
                       </div>
                     )}
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
            Möchtest du {deleteConfirmation.type === 'bulk' ? `die ${selectedIds.length} ausgewählten Einträge` : 'diesen Eintrag'} wirklich löschen? Du kannst sie später durch einen erneuten Import wieder abrufen.
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

      {/* Mapping Modal */}
      <Modal isOpen={mapConfirmation.isOpen} onClose={() => setMapConfirmation({ isOpen: false, products: [] })} title="Produkt mappen">
        <div className="space-y-6 text-sm">
          {mapConfirmation.products.length > 0 && (() => {
            if (mapConfirmation.products.length === 1) {
              const product = mapConfirmation.products[0];
              const ean = getEanFromPayload(product.rawPayload);
              return (
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl mb-4">
                  <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Zu mappendes Produkt</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-md uppercase tracking-wider">
                      {getMarketplaceDisplayName(product.marketplace)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-semibold uppercase">SKU:</span>
                      <span className="font-mono text-sm font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
                        {product.marketplaceSku}
                      </span>
                    </div>
                    {ean && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-semibold uppercase">EAN:</span>
                        <span className="font-mono text-sm font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
                          {ean}
                        </span>
                      </div>
                    )}
                  </div>
                  <h3 className="mt-2 text-base font-bold text-slate-900">{product.title}</h3>
                </div>
              );
            } else {
              return (
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl mb-4">
                  <h3 className="text-base font-bold text-indigo-900">{mapConfirmation.products.length} Produkte werden gemappt</h3>
                  <p className="text-indigo-700 text-sm mt-1">
                    Sie weisen nun {mapConfirmation.products.length} ungemappte Marktplatz-Angebote demselben zentralen Stammprodukt zu.
                  </p>
                </div>
              )
            }
          })()}

          <div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Suche nach Stammprodukt (Name oder SKU)..."
                className="w-full pl-9 pr-12 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 placeholder:text-slate-500 bg-white"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={`absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none ${isSearching ? 'right-9' : 'right-3'}`}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              {isSearching && (
                <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
              )}
            </div>

            <div className="mt-4 max-h-60 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100 custom-scrollbar">
              {searchQuery.length < 2 ? (
                <>
                  {isLoadingSuggestions ? (
                    <div className="p-6 text-center text-slate-500 text-sm flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Lade Vorschläge...</div>
                  ) : suggestions.length > 0 ? (
                    <div>
                      <div className="bg-indigo-50/50 px-3 py-2 text-xs font-semibold text-indigo-700 uppercase tracking-wider border-b border-indigo-100">
                        Vorgeschlagene Produkte (SKU / EAN Match)
                      </div>
                      {suggestions.map(p => (
                        <div 
                          key={p.id} 
                          onClick={() => setSelectedProductId(p.id)}
                          className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${selectedProductId === p.id ? 'bg-indigo-50/50' : 'hover:bg-slate-50/50'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="mt-0.5 flex items-center">
                              <input 
                                type="radio"
                                checked={selectedProductId === p.id}
                                readOnly
                                className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-600"
                              />
                            </div>
                            <div>
                              <div className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded inline-block mb-1">
                                {p.sku}
                              </div>
                              {p.ean && (
                                <div className="ml-2 font-mono text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded inline-block mb-1">
                                  EAN: {p.ean}
                                </div>
                              )}
                              <h4 className="text-sm font-semibold text-slate-900 line-clamp-1">{p.title}</h4>
                            </div>
                          </div>
                          <div className="text-right text-xs text-slate-500">
                            <div>Preis: {p.price} €</div>
                            <div>Bestand: {p.currentStock}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-slate-500 text-sm">Bitte gib mindestens 2 Zeichen ein, um zu suchen.</div>
                  )}
                </>
              ) : searchResults.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">{isSearching ? 'Sucht...' : 'Keine Produkte gefunden.'}</div>
              ) : (
                searchResults.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => setSelectedProductId(p.id)}
                    className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${selectedProductId === p.id ? 'bg-indigo-50/50' : 'hover:bg-slate-50/50'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="mt-0.5 flex items-center">
                        <input 
                          type="radio"
                          checked={selectedProductId === p.id}
                          readOnly
                          className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-600"
                        />
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded inline-block mb-1">
                          {p.sku}
                        </div>
                        {p.ean && (
                          <div className="ml-2 font-mono text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded inline-block mb-1">
                            EAN: {p.ean}
                          </div>
                        )}
                        <h4 className="text-sm font-semibold text-slate-900 line-clamp-1">{p.title}</h4>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>Preis: {p.price} €</div>
                      <div>Bestand: {p.currentStock}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button onClick={() => setMapConfirmation({ isOpen: false, products: [] })} className="px-6 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors" disabled={isSubmitting}>
              Abbrechen
            </button>
            <button onClick={handleCreateFromMapModal} className="px-6 py-2.5 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors" disabled={isSubmitting}>
              Als neues Produkt anlegen
            </button>
            <button onClick={handleConfirmMap} className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 transition-all flex items-center gap-2 disabled:opacity-50" disabled={isSubmitting || !selectedProductId}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Mappen'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Auto-Map Modal */}
      <Modal isOpen={autoMapState.isOpen} onClose={() => setAutoMapState({ isOpen: false, matches: [], isLoading: false })} title="Automatisches Mapping">
        <div className="space-y-6 text-sm">
          {autoMapState.isLoading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p>Suche nach übereinstimmenden SKUs und EANs...</p>
            </div>
          ) : autoMapState.matches.length === 0 ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <Info className="w-8 h-8 text-slate-300" />
              <p>Keine übereinstimmenden Produkte gefunden.</p>
              <p className="text-xs max-w-sm">Es wurden keine ungemappten Produkte gefunden, deren EAN oder SKU mit einem bestehenden Stammprodukt übereinstimmt.</p>
            </div>
          ) : (
            <>
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-800">
                <p className="font-semibold text-base mb-1">
                  {filteredAutoMapMatches.length} Produkte können automatisch gemappt werden!
                </p>
                <p className="text-indigo-600 mb-4">
                  Diese ungemappten Produkte haben eine EAN oder SKU, die exakt mit einem deiner Stammprodukte übereinstimmt.
                </p>
                <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-indigo-100">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={autoMapOptions.matchEan} 
                      onChange={(e) => setAutoMapOptions(prev => ({...prev, matchEan: e.target.checked}))} 
                      className="w-4 h-4 text-indigo-600 rounded border-indigo-300 focus:ring-indigo-600" 
                    />
                    <span className="text-sm font-semibold text-indigo-900">Nach EAN abgleichen</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={autoMapOptions.matchSku} 
                      onChange={(e) => setAutoMapOptions(prev => ({...prev, matchSku: e.target.checked}))} 
                      className="w-4 h-4 text-indigo-600 rounded border-indigo-300 focus:ring-indigo-600" 
                    />
                    <span className="text-sm font-semibold text-indigo-900">Nach SKU abgleichen</span>
                  </label>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 custom-scrollbar">
                {filteredAutoMapMatches.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <p className="font-medium">Keine Produkte zur Auswahl.</p>
                    <p className="text-xs mt-1">Ändere die Filter-Einstellungen oben, um Produkte anzuzeigen.</p>
                  </div>
                ) : filteredAutoMapMatches.map((m, i) => (
                  <div key={i} className="p-4 bg-white flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                       <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase tracking-wider">
                         {getMarketplaceDisplayName(m.unmappedMarketplace)}
                       </span>
                       <span className="font-bold text-slate-900">{m.unmappedTitle}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <div>
                        <span className="font-semibold uppercase">Von SKU: </span>
                        <span className="font-mono">{m.unmappedSku}</span>
                      </div>
                      <div className="flex-1 border-t border-dashed border-slate-300 relative top-0.5"></div>
                      <div className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold text-[10px] uppercase">
                        {m.matchReason} Match
                      </div>
                      <div className="flex-1 border-t border-dashed border-slate-300 relative top-0.5"></div>
                      <div>
                        <span className="font-semibold uppercase">Zu SKU: </span>
                        <span className="font-mono">{m.matchedProductSku}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button onClick={() => setAutoMapState({ isOpen: false, matches: [], isLoading: false })} className="px-6 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors" disabled={isSubmitting}>
                  Abbrechen
                </button>
                <button onClick={handleConfirmAutoMap} className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 transition-all flex items-center gap-2 disabled:opacity-50" disabled={isSubmitting || filteredAutoMapMatches.length === 0}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
                  Alle {filteredAutoMapMatches.length} Produkte mappen
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}

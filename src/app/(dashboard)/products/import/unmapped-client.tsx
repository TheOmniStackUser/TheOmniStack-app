'use client'

import { useState, useMemo } from 'react'
import { Database, Search, Filter, Loader2, CheckSquare, Square } from 'lucide-react'
import { bulkCreateProductsFromUnmapped } from '@/app/actions/products'
import { useRouter } from 'next/navigation'
import { UnmappedMarketplaceProduct } from '@/db/schema/products'

interface UnmappedClientProps {
  unmappedProducts: UnmappedMarketplaceProduct[]
  marketplaces: any[]
}

export function UnmappedClient({ unmappedProducts, marketplaces }: UnmappedClientProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)

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
      alert('Fehler beim Anlegen der Produkte')
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
      alert('Fehler beim Anlegen des Produkts')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMapSingle = (id: string) => {
    alert('Die Mappen-Funktion (Suche nach bestehenden Produkten) wird in Kürze hinzugefügt. Bitte lege das Produkt vorerst neu an oder warte auf das Update.')
  }

  return (
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
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              className="w-full sm:w-auto border border-slate-200 rounded-lg text-sm py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={marketplaceFilter}
              onChange={(e) => setMarketplaceFilter(e.target.value)}
            >
              <option value="all">Alle Marktplätze</option>
              {uniqueMarketplaces.map(m => (
                <option key={m.type} value={m.type}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
            <span className="text-indigo-800 text-sm font-semibold">
              {selectedIds.size} Produkte ausgewählt
            </span>
            <button
              onClick={handleBulkCreate}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 transition-all disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Ausgewählte als Neu anlegen
            </button>
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
              <div key={p.id} className={`p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 transition-colors ${selectedIds.has(p.id) ? 'bg-indigo-50/30' : 'hover:bg-slate-50/30'}`}>
                
                <div className="flex items-start gap-4 flex-1">
                  <button onClick={() => toggleSelect(p.id)} className="mt-1 focus:outline-none">
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

                <div className="flex gap-3 w-full lg:w-auto lg:pl-10">
                  <button onClick={() => handleMapSingle(p.id)} className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all font-semibold shadow-sm text-sm">
                    Mappen
                  </button>
                  <button disabled={isSubmitting} onClick={() => handleCreateSingle(p.id)} className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg hover:from-emerald-400 hover:to-teal-400 transition-all font-semibold shadow-sm text-sm disabled:opacity-50">
                    Als Neu anlegen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

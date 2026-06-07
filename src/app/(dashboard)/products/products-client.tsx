'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { Package, Search, ChevronUp, ChevronDown, ChevronRight, Scale, MapPin, Tag, FileText, Barcode, ExternalLink, Trash2 } from 'lucide-react'
import { DeleteProductButton } from './delete-button'
import { useRouter } from 'next/navigation'

type Product = any

export function ProductsClient({ initialProducts }: { initialProducts: Product[] }) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortColumn, setSortColumn] = useState<string>('createdAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  const toggleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  const toggleSelectAll = () => {
    if (selectedProductIds.size === filteredAndSortedProducts.length && filteredAndSortedProducts.length > 0) {
      setSelectedProductIds(new Set())
    } else {
      setSelectedProductIds(new Set(filteredAndSortedProducts.map(p => p.id)))
    }
  }

  const toggleSelectProduct = (id: string) => {
    const newSelected = new Set(selectedProductIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedProductIds(newSelected)
  }

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true)
    try {
      const { bulkDeleteProducts } = await import('@/app/actions/products')
      await bulkDeleteProducts(Array.from(selectedProductIds))
      setSelectedProductIds(new Set())
      setShowBulkDeleteConfirm(false)
      router.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const filteredAndSortedProducts = useMemo(() => {
    let result = [...initialProducts]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(p => 
        (p.sku && p.sku.toLowerCase().includes(q)) || 
        (p.title && p.title.toLowerCase().includes(q)) || 
        (p.ean && p.ean.toLowerCase().includes(q))
      )
    }

    result.sort((a, b) => {
      let aVal = a[sortColumn]
      let bVal = b[sortColumn]

      if (sortColumn === 'price' || sortColumn === 'currentStock') {
        aVal = Number(aVal) || 0
        bVal = Number(bVal) || 0
      } else if (sortColumn === 'updatedAt' || sortColumn === 'createdAt') {
        aVal = new Date(aVal || 0).getTime()
        bVal = new Date(bVal || 0).getTime()
      } else {
        aVal = String(aVal || '').toLowerCase()
        bVal = String(bVal || '').toLowerCase()
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [initialProducts, searchQuery, sortColumn, sortDirection])

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ChevronUp className="w-3 h-3 opacity-20" />
    return sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 text-cyan-600" /> : <ChevronDown className="w-3 h-3 text-cyan-600" />
  }

  const Th = ({ children, column, className = "" }: { children: React.ReactNode, column: string, className?: string }) => (
    <th 
      className={`px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors select-none ${className}`}
      onClick={() => toggleSort(column)}
    >
      <div className={`flex items-center gap-1.5 ${className.includes('text-right') ? 'justify-end' : ''}`}>
        {children}
        <SortIcon column={column} />
      </div>
    </th>
  )

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="SKU, Titel oder EAN suchen..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all text-slate-900 placeholder:text-slate-500"
          />
        </div>
        
        {selectedProductIds.size > 0 && (
          <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-4">
            <span className="text-sm font-medium text-slate-500">
              {selectedProductIds.size} ausgewählt
            </span>
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors text-sm font-semibold border border-rose-200"
            >
              <Trash2 className="w-4 h-4" />
              Löschen
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="w-12 px-4 text-center">
                <input
                  type="checkbox"
                  checked={selectedProductIds.size > 0 && selectedProductIds.size === filteredAndSortedProducts.length}
                  ref={input => {
                    if (input) {
                      input.indeterminate = selectedProductIds.size > 0 && selectedProductIds.size < filteredAndSortedProducts.length
                    }
                  }}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-600 focus:ring-offset-0 bg-white cursor-pointer"
                />
              </th>
              <th className="w-10 px-4"></th>
              <Th column="sku">SKU</Th>
              <Th column="title">Titel</Th>
              <Th column="currentStock">Bestand</Th>
              <Th column="price">Preis (Netto)</Th>
              <Th column="updatedAt">Letzte Änderung</Th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredAndSortedProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                      <Package className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-base font-semibold text-slate-900">Keine Produkte gefunden</p>
                    <p className="text-sm mt-1">Passen Sie Ihre Suche an oder legen Sie ein neues Produkt an.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredAndSortedProducts.map((product) => {
                const isExpanded = expandedRows.has(product.id)
                const isSelected = selectedProductIds.has(product.id)
                return (
                  <React.Fragment key={product.id}>
                    <tr 
                      className={`hover:bg-slate-50/50 transition-colors group cursor-pointer ${isExpanded ? 'bg-slate-50/50' : ''} ${isSelected ? 'bg-cyan-50/30' : ''}`}
                      onClick={() => toggleRow(product.id)}
                    >
                      <td className="px-4 py-4 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectProduct(product.id)}
                          className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-600 focus:ring-offset-0 bg-white cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-4 text-slate-400">
                        <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-cyan-600' : ''}`} />
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-mono font-bold">
                          {product.sku}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 line-clamp-1">{product.title}</div>
                        {product.ean && <div className="text-xs text-slate-500 mt-0.5">EAN: {product.ean}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${Number(product.currentStock) > 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          <span className="font-semibold text-slate-700">{product.currentStock}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-700 font-medium">
                        {Number(product.price).toFixed(2)} €
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm">
                        {new Date(product.updatedAt).toLocaleDateString('de-DE')}
                      </td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link 
                            href={`/products/${product.id}`}
                            className="text-sm font-semibold text-cyan-600 hover:text-cyan-700 transition-colors"
                          >
                            Bearbeiten
                          </Link>
                          <DeleteProductButton productId={product.id} productTitle={product.title} />
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/30 border-b border-slate-100">
                        <td colSpan={8} className="p-0">
                          <div className="px-14 py-6 animate-in slide-in-from-top-2 fade-in duration-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              <div className="space-y-4">
                                <div>
                                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5"/> Beschreibung</div>
                                  <div className="text-sm text-slate-700 bg-white p-3 rounded-lg border border-slate-200 min-h-[80px]">
                                    {product.description || <span className="text-slate-400 italic">Keine Beschreibung hinterlegt.</span>}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="space-y-4">
                                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Barcode className="w-3.5 h-3.5"/> EAN</span>
                                    <span className="text-sm text-slate-900 font-mono">{product.ean || '-'}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Scale className="w-3.5 h-3.5"/> Gewicht</span>
                                    <span className="text-sm text-slate-900">{product.weight ? `${product.weight} kg` : '-'}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5"/> Lagerort</span>
                                    <span className="text-sm text-slate-900">{product.storageLocation || '-'}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Tag className="w-3.5 h-3.5"/> UVP</span>
                                    <span className="text-sm text-slate-900">{product.msrp ? `${Number(product.msrp).toFixed(2)} €` : '-'}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Tag className="w-3.5 h-3.5 text-rose-400"/> Einkaufspreis</span>
                                    <span className="text-sm text-slate-900">{product.purchasePrice ? `${Number(product.purchasePrice).toFixed(2)} €` : '-'}</span>
                                  </div>
                                </div>
                                
                                <div className="flex justify-end pt-2">
                                  <Link 
                                    href={`/products/${product.id}`}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                    Vollständige Details öffnen
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowBulkDeleteConfirm(false)}>
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200 relative overflow-hidden text-left" 
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-xl mb-2">{selectedProductIds.size} {selectedProductIds.size === 1 ? 'Produkt' : 'Produkte'} löschen?</h3>
              <p className="text-slate-500 text-sm">
                Möchten Sie die {selectedProductIds.size} ausgewählten Produkte wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden und entfernt auch alle zugehörigen Marktplatz-Mappings.
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
                disabled={isBulkDeleting}
              >
                Abbrechen
              </button>
              <button 
                onClick={handleBulkDelete}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 shadow-sm shadow-rose-600/20 transition-all flex items-center gap-2"
                disabled={isBulkDeleting}
              >
                {isBulkDeleting ? 'Lösche...' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { Package, Search, ChevronUp, ChevronDown, ChevronRight, Scale, MapPin, Tag, FileText, Barcode, ExternalLink, Trash2, Building2, X, Loader2, Copy, MoreHorizontal } from 'lucide-react'
import { DeleteProductButton } from './delete-button'
import { useRouter } from 'next/navigation'

type Product = any

function StockEditor({ product }: { product: Product }) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(product.currentStock || '0')
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  const handleSave = async () => {
    let numericValue = Number(value)
    
    // Prevent negative stock
    if (numericValue < 0) {
      numericValue = 0
      setValue('0')
    }

    if (String(numericValue) === product.currentStock || isNaN(numericValue)) {
      setIsEditing(false)
      setValue(product.currentStock || '0')
      return
    }
    
    setIsSaving(true)
    try {
      const { updateProductStockInline } = await import('@/app/actions/products')
      await updateProductStockInline(product.id, numericValue)
      setIsEditing(false)
      router.refresh()
    } catch (e) {
      console.error(e)
      alert("Fehler beim Speichern des Bestands")
      setValue(product.currentStock || '0')
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setValue(product.currentStock || '0')
      setIsEditing(false)
    }
  }

  if (!isEditing) {
    return (
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 -ml-1.5 rounded-md transition-colors group w-fit"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}
        title="Bestand bearbeiten"
      >
        <div className={`w-2 h-2 rounded-full ${Number(product.currentStock) > 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        <span className="font-semibold text-slate-700 border-b border-slate-300 border-dashed">{product.currentStock}</span>
        {isSaving ? (
          <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input
        autoFocus
        type="number"
        min="0"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        className="w-20 px-2 py-1 text-sm border border-cyan-400 focus:ring-2 focus:ring-cyan-500/50 outline-none rounded font-semibold text-slate-900 bg-white"
      />
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="p-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50 flex items-center justify-center"
        title="Speichern"
      >
        {isSaving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        )}
      </button>
      <button
        onClick={() => { setValue(product.currentStock || '0'); setIsEditing(false); }}
        disabled={isSaving}
        className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-50"
        title="Abbrechen"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function PriceEditor({ product }: { product: Product }) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(product.price ? Number(product.price).toFixed(2) : '0.00')
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  const handleSave = async () => {
    let numericValue = Number(value.replace(',', '.'))
    
    if (numericValue < 0) {
      numericValue = 0
      setValue('0.00')
    }

    if (String(numericValue) === product.price || isNaN(numericValue)) {
      setIsEditing(false)
      setValue(product.price ? Number(product.price).toFixed(2) : '0.00')
      return
    }
    
    setIsSaving(true)
    try {
      const { updateProductPriceInline } = await import('@/app/actions/products')
      await updateProductPriceInline(product.id, numericValue)
      setIsEditing(false)
      router.refresh()
    } catch (e) {
      console.error(e)
      alert("Fehler beim Speichern des Preises")
      setValue(product.price ? Number(product.price).toFixed(2) : '0.00')
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setValue(product.price ? Number(product.price).toFixed(2) : '0.00')
      setIsEditing(false)
    }
  }

  if (!isEditing) {
    return (
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 -ml-1.5 rounded-md transition-colors group w-fit"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}
        title="Preis bearbeiten"
      >
        <span className="font-semibold text-slate-700 border-b border-slate-300 border-dashed">{Number(product.price || 0).toFixed(2)} €</span>
        {isSaving ? (
          <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input
        autoFocus
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        className="w-24 px-2 py-1 text-sm border border-cyan-400 focus:ring-2 focus:ring-cyan-500/50 outline-none rounded font-semibold text-slate-900 bg-white"
      />
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="p-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50 flex items-center justify-center"
        title="Speichern"
      >
        {isSaving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        )}
      </button>
      <button
        onClick={() => { setValue(product.price ? Number(product.price).toFixed(2) : '0.00'); setIsEditing(false); }}
        disabled={isSaving}
        className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-50"
        title="Abbrechen"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function ProductsClient({ initialProducts }: { initialProducts: Product[] }) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchField, setSearchField] = useState<'all' | 'sku' | 'title' | 'ean'>('all')
  const [syncFilter, setSyncFilter] = useState<'all' | 'stock_on' | 'stock_off' | 'price_on' | 'price_off'>('all')
  const [sortColumn, setSortColumn] = useState<string>('createdAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(current => current?.message === message ? null : current)
    }, 3000)
  }

  const handleToggleSync = async (productId: string, field: 'stock' | 'price', value: boolean) => {
    try {
      const { toggleProductSync } = await import('@/app/actions/products')
      await toggleProductSync(productId, field, value)
      showToast(`${field === 'stock' ? 'Bestand' : 'Preis'}-Sync aktualisiert`, 'success')
      setOpenMenuId(null)
      router.refresh()
    } catch (e) {
      console.error(e)
      showToast('Fehler beim Aktualisieren', 'error')
    }
  }

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

    if (syncFilter !== 'all') {
      result = result.filter(p => {
        if (syncFilter === 'stock_on') return p.hasSyncStockOn
        if (syncFilter === 'stock_off') return p.hasSyncStockOff
        if (syncFilter === 'price_on') return p.hasSyncPriceOn
        if (syncFilter === 'price_off') return p.hasSyncPriceOff
        return true
      })
    }

    if (searchQuery.trim()) {
      const terms = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean)
      result = result.filter(p => {
        return terms.every(term => {
          if (searchField === 'sku') {
            return (p.sku && p.sku.toLowerCase().includes(term)) || (p.mappingSkus && p.mappingSkus.toLowerCase().includes(term))
          }
          if (searchField === 'title') {
            return (p.title && p.title.toLowerCase().includes(term))
          }
          if (searchField === 'ean') {
            return (p.ean && p.ean.toLowerCase().includes(term)) || (p.mappingEans && p.mappingEans.toLowerCase().includes(term))
          }
          return (p.sku && p.sku.toLowerCase().includes(term)) || 
            (p.title && p.title.toLowerCase().includes(term)) || 
            (p.ean && p.ean.toLowerCase().includes(term)) ||
            (p.mappingSkus && p.mappingSkus.toLowerCase().includes(term)) ||
            (p.mappingEans && p.mappingEans.toLowerCase().includes(term))
        })
      })
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
  }, [initialProducts, searchQuery, sortColumn, sortDirection, searchField, syncFilter])

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
        <div className="relative flex-1 max-w-2xl flex items-center gap-2">
          <select
            value={searchField}
            onChange={(e) => setSearchField(e.target.value as any)}
            className="w-36 py-2 pl-3 pr-8 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all text-slate-900"
          >
            <option value="all">Alle Felder</option>
            <option value="sku">SKU</option>
            <option value="title">Titel</option>
            <option value="ean">EAN</option>
          </select>
          <select
            value={syncFilter}
            onChange={(e) => setSyncFilter(e.target.value as any)}
            className="w-48 py-2 pl-3 pr-8 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all text-slate-900"
          >
            <option value="all">Alle Sync-Stati</option>
            <option value="stock_on">Bestand Sync: AN</option>
            <option value="stock_off">Bestand Sync: AUS</option>
            <option value="price_on">Preis Sync: AN</option>
            <option value="price_off">Preis Sync: AUS</option>
          </select>
          <div className="relative flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                placeholder={searchField === 'all' ? "SKU, Titel oder EAN suchen..." : `${searchField.toUpperCase()} suchen...`} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all text-slate-900 placeholder:text-slate-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded-full hover:bg-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button 
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2"
              onClick={(e) => e.preventDefault()}
            >
              Suchen
            </button>
          </div>
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
              <Th column="price">Preis (Brutto)</Th>
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
                      <td className="px-6 py-4 group/sku">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-mono font-bold">
                            {product.sku}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              navigator.clipboard.writeText(product.sku)
                              showToast('SKU kopiert', 'success')
                            }}
                            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover/sku:opacity-100 transition-all focus:opacity-100"
                            title="SKU kopieren"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 line-clamp-1">{product.title}</div>
                        {product.ean && (
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 group/ean w-fit">
                            <span>EAN: {product.ean}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                navigator.clipboard.writeText(product.ean)
                                showToast('EAN kopiert', 'success')
                              }}
                              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover/ean:opacity-100 transition-all focus:opacity-100"
                              title="EAN kopieren"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StockEditor product={product} />
                      </td>
                      <td className="px-6 py-4">
                        <PriceEditor product={product} />
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm">
                        {new Date(product.updatedAt).toLocaleDateString('de-DE')}
                      </td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-3 opacity-100 transition-opacity">
                          <Link 
                            href={`/products/${product.id}`}
                            className="text-sm font-semibold text-cyan-600 hover:text-cyan-700 transition-colors"
                          >
                            Bearbeiten
                          </Link>
                          <DeleteProductButton productId={product.id} productTitle={product.title} />
                          
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenMenuId(openMenuId === product.id ? null : product.id)
                              }}
                              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors outline-none focus:outline-none border-none"
                            >
                              <MoreHorizontal className="w-5 h-5" />
                            </button>
                            
                            {openMenuId === product.id && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} />
                                <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 text-left overflow-hidden">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); if (product.hasSyncStockOff) handleToggleSync(product.id, 'stock', true); }}
                                    disabled={!product.hasSyncStockOff}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors font-medium ${!product.hasSyncStockOff ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-50'}`}
                                  >
                                    Bestand-Sync aktivieren
                                  </button>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); if (product.hasSyncStockOn) handleToggleSync(product.id, 'stock', false); }}
                                    disabled={!product.hasSyncStockOn}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors font-medium border-b border-slate-100 ${!product.hasSyncStockOn ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-50'}`}
                                  >
                                    Bestand-Sync deaktivieren
                                  </button>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); if (product.hasSyncPriceOff) handleToggleSync(product.id, 'price', true); }}
                                    disabled={!product.hasSyncPriceOff}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors font-medium ${!product.hasSyncPriceOff ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-50'}`}
                                  >
                                    Preis-Sync aktivieren
                                  </button>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); if (product.hasSyncPriceOn) handleToggleSync(product.id, 'price', false); }}
                                    disabled={!product.hasSyncPriceOn}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors font-medium ${!product.hasSyncPriceOn ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-50'}`}
                                  >
                                    Preis-Sync deaktivieren
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
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
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5"/> Marke</span>
                                    <span className="text-sm text-slate-900">{product.brand || '-'}</span>
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

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg shadow-slate-200/50 flex items-center gap-3 animate-in slide-in-from-bottom-5 z-50 ${
          toast.type === 'error' ? 'bg-red-500 text-white' : 
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 
          'bg-slate-800 text-white'
        }`}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-white/70 hover:text-white">✕</button>
        </div>
      )}
    </div>
  )
}

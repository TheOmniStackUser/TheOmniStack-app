'use client'

import React, { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { Package, Search, ChevronUp, ChevronDown, ChevronRight, Scale, MapPin, Tag, FileText, Barcode, ExternalLink, Trash2, Building2, X, Loader2, Copy, MoreHorizontal, GitMerge, CheckCircle2, RotateCcw, Filter, Palette, Check } from 'lucide-react'
import { DeleteProductButton } from './delete-button'
import { useRouter } from 'next/navigation'

type Product = any

function StockEditor({ product, onToast }: { product: Product; onToast?: (message: string, type: 'success' | 'error' | 'info') => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(product.currentStock || '0')
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!isEditing) {
      setValue(product.currentStock || '0')
    }
  }, [product.currentStock, isEditing])

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
      onToast?.('Bestand erfolgreich aktualisiert', 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      onToast?.('Fehler beim Speichern des Bestands', 'error')
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
        <span className="font-semibold text-slate-700 border-b border-slate-300 border-dashed whitespace-nowrap">{product.currentStock}</span>
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
        value={value} onChange={e => setValue(e.target.value)}
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


function PriceEditor({ product, onToast }: { product: Product; onToast?: (message: string, type: 'success' | 'error' | 'info') => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(product.price ? Number(product.price).toFixed(2) : '0.00')
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!isEditing) {
      setValue(product.price ? Number(product.price).toFixed(2) : '0.00')
    }
  }, [product.price, isEditing])

  const handleSave = async () => {
    let numericValue = Number(value.replace(',', '.'))
    if (numericValue < 0) { numericValue = 0; setValue('0.00') }
    if (numericValue === Number(product.price || 0) || isNaN(numericValue)) {
      setIsEditing(false)
      setValue(product.price ? Number(product.price).toFixed(2) : '0.00')
      return
    }
    setIsSaving(true)
    try {
      const { bulkUpdateStockAndPrice } = await import('@/app/actions/products')
      await bulkUpdateStockAndPrice([product.id], undefined, numericValue)
      setIsEditing(false)
      onToast?.('Standard-Preis erfolgreich aktualisiert', 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      onToast?.('Fehler beim Speichern des Preises', 'error')
      setValue(product.price ? Number(product.price).toFixed(2) : '0.00')
    } finally { setIsSaving(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') { setValue(product.price ? Number(product.price).toFixed(2) : '0.00'); setIsEditing(false) }
  }

  if (!isEditing) {
    return (
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 -ml-1.5 rounded-md transition-colors group w-fit"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}
        title="Standard Preis bearbeiten"
      >
        <span className="font-semibold text-slate-700 border-b border-slate-300 border-dashed whitespace-nowrap">{Number(product.price || 0).toFixed(2)} €</span>
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
      <input autoFocus type="number" step="0.01" min="0" value={value} onChange={e => setValue(e.target.value)} onKeyDown={handleKeyDown} disabled={isSaving} className="w-24 px-2 py-1 text-sm border border-cyan-400 focus:ring-2 focus:ring-cyan-500/50 outline-none rounded font-semibold text-slate-900 bg-white" />
      <button onClick={handleSave} disabled={isSaving} className="p-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button onClick={() => { setValue(product.price ? Number(product.price).toFixed(2) : '0.00'); setIsEditing(false); }} disabled={isSaving} className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"><X className="w-3.5 h-3.5" /></button>
    </div>
  )
}


function MsrpEditor({ product, onToast }: { product: Product; onToast?: (message: string, type: 'success' | 'error' | 'info') => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(product.msrp ? Number(product.msrp).toFixed(2) : '0.00')
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!isEditing) {
      setValue(product.msrp ? Number(product.msrp).toFixed(2) : '0.00')
    }
  }, [product.msrp, isEditing])

  const handleSave = async () => {
    let numericValue = Number(value.replace(',', '.'))
    
    if (numericValue < 0) {
      numericValue = 0
      setValue('0.00')
    }

    if (String(numericValue) === product.msrp || isNaN(numericValue)) {
      setIsEditing(false)
      setValue(product.msrp ? Number(product.msrp).toFixed(2) : '0.00')
      return
    }
    
    setIsSaving(true)
    try {
      const { bulkUpdateStockAndPrice } = await import('@/app/actions/products')
      await bulkUpdateStockAndPrice([product.id], undefined, undefined, undefined, numericValue)
      setIsEditing(false)
      onToast?.('UVP erfolgreich aktualisiert', 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      onToast?.('Fehler beim Speichern des UVP', 'error')
      setValue(product.msrp ? Number(product.msrp).toFixed(2) : '0.00')
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setValue(product.msrp ? Number(product.msrp).toFixed(2) : '0.00')
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
        <span className="font-semibold text-slate-700 border-b border-slate-300 border-dashed whitespace-nowrap">{Number(product.msrp || 0).toFixed(2)} €</span>
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
        value={value} onChange={e => setValue(e.target.value)}
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
        onClick={() => { setValue(product.msrp ? Number(product.msrp).toFixed(2) : '0.00'); setIsEditing(false); }}
        disabled={isSaving}
        className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-50"
        title="Abbrechen"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}


function ReducedPriceEditor({ product, onToast }: { product: Product; onToast?: (message: string, type: 'success' | 'error' | 'info') => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(product.reducedPrice ? Number(product.reducedPrice).toFixed(2) : '')
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!isEditing) {
      setValue(product.reducedPrice ? Number(product.reducedPrice).toFixed(2) : '')
    }
  }, [product.reducedPrice, isEditing])

  const handleSave = async () => {
    let numericValue = value.trim() === '' ? 0 : Number(value.replace(',', '.'))
    
    if (numericValue < 0) {
      numericValue = 0
      setValue('')
    }

    if (isNaN(numericValue)) {
      setIsEditing(false)
      setValue(product.reducedPrice ? Number(product.reducedPrice).toFixed(2) : '')
      return
    }
    
    setIsSaving(true)
    try {
      const { bulkUpdateStockAndPrice } = await import('@/app/actions/products')
      await bulkUpdateStockAndPrice([product.id], undefined, undefined, numericValue)
      setIsEditing(false)
      onToast?.('Aktionspreis erfolgreich aktualisiert', 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      onToast?.('Fehler beim Speichern des Aktionspreises', 'error')
      setValue(product.reducedPrice ? Number(product.reducedPrice).toFixed(2) : '')
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setValue(product.reducedPrice ? Number(product.reducedPrice).toFixed(2) : '')
      setIsEditing(false)
    }
  }

  if (!isEditing) {
    return (
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 -ml-1.5 rounded-md transition-colors group w-fit"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}
        title="Aktionspreis bearbeiten"
      >
        <span className="font-semibold text-rose-600 border-b border-rose-200 border-dashed whitespace-nowrap">{product.reducedPrice ? Number(product.reducedPrice).toFixed(2) + ' €' : '-'}</span>
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
        value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        placeholder="0.00"
        className="w-24 px-2 py-1 text-sm border border-rose-400 focus:ring-2 focus:ring-rose-500/50 outline-none rounded font-semibold text-rose-600 bg-white"
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
        onClick={() => { setValue(product.reducedPrice ? Number(product.reducedPrice).toFixed(2) : ''); setIsEditing(false); }}
        disabled={isSaving}
        className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-50"
        title="Abbrechen"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}


function ReducedPriceDatesEditor({ product, onToast }: { product: Product; onToast?: (message: string, type: 'success' | 'error' | 'info') => void }) {
  const [isEditing, setIsEditing] = useState(false)
  
  const formatDateForInput = (date: any) => {
    if (!date) return ''
    try {
      return new Date(date).toISOString().split('T')[0]
    } catch {
      return ''
    }
  }
  
  const [startValue, setStartValue] = useState(formatDateForInput(product.saleStartDate))
  const [endValue, setEndValue] = useState(formatDateForInput(product.saleEndDate))
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!isEditing) {
      setStartValue(formatDateForInput(product.saleStartDate))
      setEndValue(formatDateForInput(product.saleEndDate))
    }
  }, [product.saleStartDate, product.saleEndDate, isEditing])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const { bulkUpdateStockAndPrice } = await import('@/app/actions/products')
      const sDate = startValue ? new Date(startValue) : null
      const eDate = endValue ? new Date(endValue) : null
      await bulkUpdateStockAndPrice([product.id], undefined, undefined, undefined, undefined, sDate, eDate)
      setIsEditing(false)
      onToast?.('Aktionszeitraum erfolgreich aktualisiert', 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      onToast?.('Fehler beim Speichern der Aktionsdaten', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setStartValue(formatDateForInput(product.saleStartDate))
      setEndValue(formatDateForInput(product.saleEndDate))
      setIsEditing(false)
    }
  }

  const displayString = () => {
    if (!product.saleStartDate && !product.saleEndDate) return '-'
    const s = product.saleStartDate ? new Date(product.saleStartDate).toLocaleDateString('de-DE') : 'Unbegrenzt'
    const e = product.saleEndDate ? new Date(product.saleEndDate).toLocaleDateString('de-DE') : 'Unbegrenzt'
    return `${s} - ${e}`
  }

  if (!isEditing) {
    return (
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 -ml-1.5 rounded-md transition-colors group w-fit"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}
        title="Aktionszeitraum bearbeiten"
      >
        <span className="text-xs font-medium text-slate-500 border-b border-slate-300 border-dashed whitespace-nowrap">{displayString()}</span>
        {isSaving ? (
          <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 bg-white p-2 rounded-lg border border-slate-200 shadow-sm" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase w-8">Von</label>
        <input
          autoFocus
          type="date"
          value={startValue}
          onChange={e => setStartValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="w-28 px-2 py-1 text-xs border border-slate-300 focus:border-cyan-500 outline-none rounded text-slate-700 bg-white"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase w-8">Bis</label>
        <input
          type="date"
          value={endValue}
          onChange={e => setEndValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="w-28 px-2 py-1 text-xs border border-slate-300 focus:border-cyan-500 outline-none rounded text-slate-700 bg-white"
        />
      </div>
      <div className="flex justify-end gap-1 mt-1">
        <button onClick={() => { setStartValue(''); setEndValue(''); setIsEditing(false); }} className="px-2 py-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 text-xs">Abbrechen</button>
        <button onClick={handleSave} className="px-2 py-1 rounded bg-cyan-100 text-cyan-700 hover:bg-cyan-200 text-xs font-semibold">Speichern</button>
      </div>
    </div>
  )
}

function ColorEditor({ product, onToast }: { product: Product; onToast?: (message: string, type: 'success' | 'error' | 'info') => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(product.color || '')
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!isEditing) {
      setValue(product.color || '')
    }
  }, [product.color, isEditing])

  const handleSave = async () => {
    const trimmed = value.trim()
    if (trimmed === (product.color || '')) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    try {
      const { updateProductVariantInfoInline } = await import('@/app/actions/products')
      await updateProductVariantInfoInline(product.id, { color: trimmed })
      setIsEditing(false)
      onToast?.('Farbe erfolgreich aktualisiert', 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      onToast?.('Fehler beim Speichern der Farbe', 'error')
      setValue(product.color || '')
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setValue(product.color || '')
      setIsEditing(false)
    }
  }

  if (!isEditing) {
    return (
      <div 
        className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 p-1.5 -ml-1.5 rounded-md transition-colors group w-fit max-w-full"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}
        title="Farbe bearbeiten"
      >
        {product.color ? (
          <span className="text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md truncate max-w-[120px]">
            {product.color}
          </span>
        ) : (
          <span className="text-xs text-slate-400 italic border-b border-slate-300 border-dashed">
            -
          </span>
        )}
        {isSaving ? (
          <Loader2 className="w-3 h-3 animate-spin text-slate-400 shrink-0" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        placeholder="Farbe"
        className="w-24 px-2 py-1 text-xs border border-cyan-400 focus:ring-2 focus:ring-cyan-500/50 outline-none rounded font-semibold text-slate-900 placeholder:text-slate-500 bg-white"
      />
      <button onClick={handleSave} disabled={isSaving} className="p-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center justify-center shrink-0" title="Speichern">
        {isSaving ? <Loader2 className="w-3 animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
      </button>
      <button onClick={() => { setValue(product.color || ''); setIsEditing(false); }} disabled={isSaving} className="p-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0" title="Abbrechen">
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

function SizeEditor({ product, onToast }: { product: Product; onToast?: (message: string, type: 'success' | 'error' | 'info') => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(product.size || '')
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!isEditing) {
      setValue(product.size || '')
    }
  }, [product.size, isEditing])

  const handleSave = async () => {
    const trimmed = value.trim()
    if (trimmed === (product.size || '')) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    try {
      const { updateProductVariantInfoInline } = await import('@/app/actions/products')
      await updateProductVariantInfoInline(product.id, { size: trimmed })
      setIsEditing(false)
      onToast?.('Größe erfolgreich aktualisiert', 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      onToast?.('Fehler beim Speichern der Größe', 'error')
      setValue(product.size || '')
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setValue(product.size || '')
      setIsEditing(false)
    }
  }

  if (!isEditing) {
    return (
      <div 
        className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 p-1.5 -ml-1.5 rounded-md transition-colors group w-fit max-w-full"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}
        title="Größe bearbeiten"
      >
        {product.size ? (
          <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
            {product.size}
          </span>
        ) : (
          <span className="text-xs text-slate-400 italic border-b border-slate-300 border-dashed">
            -
          </span>
        )}
        {isSaving ? (
          <Loader2 className="w-3 h-3 animate-spin text-slate-400 shrink-0" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        placeholder="Größe"
        className="w-16 px-2 py-1 text-xs border border-cyan-400 focus:ring-2 focus:ring-cyan-500/50 outline-none rounded font-semibold text-slate-900 placeholder:text-slate-500 bg-white"
      />
      <button onClick={handleSave} disabled={isSaving} className="p-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center justify-center shrink-0" title="Speichern">
        {isSaving ? <Loader2 className="w-3 animate-spin" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
      </button>
      <button onClick={() => { setValue(product.size || ''); setIsEditing(false); }} disabled={isSaving} className="p-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0" title="Abbrechen">
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

const SIZE_ORDER: Record<string, number> = {
  'XXS': 1, '2XS': 1,
  'XS': 2,
  'S': 3,
  'M': 4,
  'L': 5,
  'XL': 6,
  'XXL': 7, '2XL': 7,
  'XXXL': 8, '3XL': 8,
  'XXXXL': 9, '4XL': 9,
  '5XL': 10,
  '6XL': 11,
  'ONESIZE': 99, 'ONE SIZE': 99, 'EINHEITSGRÖSSE': 99,
}

function compareSizes(a: string, b: string): number {
  if (a === '__EMPTY__') return 1
  if (b === '__EMPTY__') return -1

  const normA = a.toUpperCase().replace(/\s+/g, '')
  const normB = b.toUpperCase().replace(/\s+/g, '')
  const rankA = SIZE_ORDER[normA]
  const rankB = SIZE_ORDER[normB]
  if (rankA !== undefined && rankB !== undefined) return rankA - rankB
  if (rankA !== undefined) return -1
  if (rankB !== undefined) return 1
  
  const numA = parseFloat(a.replace(',', '.'))
  const numB = parseFloat(b.replace(',', '.'))
  if (!isNaN(numA) && !isNaN(numB) && !isNaN(Number(a.trim())) && !isNaN(Number(b.trim()))) {
    return numA - numB
  }
  
  return a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' })
}

function getColorDot(colorName: string): string | null {
  const c = colorName.toLowerCase().trim()
  if (c === '__empty__') return null
  if (c.includes('schwarz') || c.includes('black')) return '#18181b'
  if (c.includes('weiß') || c.includes('weiss') || c.includes('white')) return '#f8fafc'
  if (c.includes('hellgrau')) return '#cbd5e1'
  if (c.includes('dunkelgrau')) return '#475569'
  if (c.includes('grau') || c.includes('grey') || c.includes('gray')) return '#94a3b8'
  if (c.includes('dunkelblau') || c.includes('navy')) return '#1e3a8a'
  if (c.includes('hellblau')) return '#38bdf8'
  if (c.includes('blau') || c.includes('blue')) return '#2563eb'
  if (c.includes('bordeaux') || c.includes('weinrot')) return '#881337'
  if (c.includes('rot') || c.includes('red')) return '#dc2626'
  if (c.includes('dunkelgrün')) return '#14532d'
  if (c.includes('hellgrün')) return '#4ade80'
  if (c.includes('grün') || c.includes('green') || c.includes('olive')) return '#16a34a'
  if (c.includes('gelb') || c.includes('yellow')) return '#eab308'
  if (c.includes('braun') || c.includes('brown')) return '#78350f'
  if (c.includes('orange')) return '#ea580c'
  if (c.includes('rosa') || c.includes('pink')) return '#ec4899'
  if (c.includes('lila') || c.includes('purple') || c.includes('violett')) return '#9333ea'
  if (c.includes('beige')) return '#d4c5b9'
  if (c.includes('khaki')) return '#87805e'
  if (c.includes('gold')) return '#eab308'
  if (c.includes('silber') || c.includes('silver')) return '#cbd5e1'
  return null
}

function MultiSelectFacetFilter({
  title,
  icon,
  items,
  selected,
  onChange,
  placeholderSearch = 'Suchen...',
  emptyLabel = 'Ohne Angabe',
  isColor = false,
  variant = 'toolbar',
  isOpen,
  onToggle,
  onClose,
}: {
  title: string
  icon?: React.ReactNode
  items: { name: string; count: number }[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  placeholderSearch?: string
  emptyLabel?: string
  isColor?: boolean
  variant?: 'toolbar' | 'header'
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items
    const q = searchTerm.toLowerCase().trim()
    return items.filter(item => {
      const label = item.name === '__EMPTY__' ? emptyLabel : item.name
      return label.toLowerCase().includes(q)
    })
  }, [items, searchTerm, emptyLabel])

  const toggleItem = (name: string) => {
    const next = new Set(selected)
    if (next.has(name)) {
      next.delete(name)
    } else {
      next.add(name)
    }
    onChange(next)
  }

  const selectAll = () => {
    const next = new Set(selected)
    filteredItems.forEach(i => next.add(i.name))
    onChange(next)
  }

  const clearSelection = () => {
    if (searchTerm.trim()) {
      const next = new Set(selected)
      filteredItems.forEach(i => next.delete(i.name))
      onChange(next)
    } else {
      onChange(new Set())
    }
  }

  const selectedCount = selected.size

  return (
    <div className="relative inline-block text-left">
      {variant === 'toolbar' ? (
        <button
          type="button"
          onClick={onToggle}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all shadow-sm ${
            selectedCount > 0
              ? 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100 ring-2 ring-purple-500/20'
              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
          }`}
        >
          {icon}
          <span>{title}</span>
          {selectedCount > 0 ? (
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold bg-purple-600 text-white rounded-full min-w-[20px]">
              {selectedCount}
            </span>
          ) : (
            <span className="text-xs text-slate-400 font-normal">Alle</span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className={`p-1 rounded-md transition-all relative ${
            selectedCount > 0
              ? 'text-purple-600 bg-purple-100 hover:bg-purple-200 ring-1 ring-purple-400/50'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
          }`}
          title={`Nach ${title} filtern (${selectedCount > 0 ? `${selectedCount} aktiv` : 'Alle'})`}
        >
          <Filter className="w-3.5 h-3.5" />
          {selectedCount > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-purple-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm">
              {selectedCount}
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }} 
          />
          <div 
            className={`absolute ${variant === 'header' ? 'left-0 mt-2' : 'left-0 sm:left-auto sm:right-0 mt-2'} w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 p-3 text-left animate-in fade-in zoom-in-95 duration-150`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                {icon}
                <span className="text-xs font-bold text-slate-800">
                  {title} filtern
                </span>
                {selectedCount > 0 && (
                  <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full border border-purple-200">
                    {selectedCount} ausgewählt
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={placeholderSearch}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-500 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 bg-white"
                autoFocus
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Quick Actions (Select All / Clear) */}
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 px-1 py-1 mb-1 border-b border-slate-100">
              <button
                type="button"
                onClick={selectAll}
                className="hover:text-purple-600 transition-colors cursor-pointer"
              >
                Alle auswählen
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="hover:text-rose-600 transition-colors cursor-pointer"
              >
                Auswahl aufheben
              </button>
            </div>

            {/* List */}
            <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1 divide-y divide-slate-50">
              {filteredItems.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 italic">
                  Keine Einträge gefunden
                </div>
              ) : (
                filteredItems.map(item => {
                  const isChecked = selected.has(item.name)
                  const isEmpty = item.name === '__EMPTY__'
                  const label = isEmpty ? emptyLabel : item.name
                  const dot = isColor ? getColorDot(item.name) : null

                  return (
                    <label
                      key={item.name}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-colors select-none ${
                        isChecked ? 'bg-purple-50/70 text-purple-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleItem(item.name)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                        />
                        {isColor && (
                          dot ? (
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-slate-300 shrink-0"
                              style={{ backgroundColor: dot }}
                            />
                          ) : (
                            <span className="w-2.5 h-2.5 rounded-full border border-dashed border-slate-300 shrink-0" />
                          )
                        )}
                        <span className={`truncate ${isEmpty ? 'italic text-slate-400' : ''}`}>
                          {label}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full shrink-0 border border-slate-200">
                        {item.count}
                      </span>
                    </label>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">
                {items.length} {title} gefunden
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Fertig
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function ProductsClient({ initialProducts }: { initialProducts: Product[] }) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchField, setSearchField] = useState<'all' | 'sku' | 'title' | 'color' | 'size' | 'ean'>('all')
  const [syncFilter, setSyncFilter] = useState<'all' | 'stock_on' | 'stock_off' | 'price_on' | 'price_off'>('all')
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all')

  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set())
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set())
  const [activeFacetFilter, setActiveFacetFilter] = useState<string | null>(null)

  const availableColors = useMemo(() => {
    const counts = new Map<string, number>()
    let emptyCount = 0
    initialProducts.forEach(p => {
      const c = p.color?.trim()
      if (c) {
        counts.set(c, (counts.get(c) || 0) + 1)
      } else {
        emptyCount++
      }
    })
    const list = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de'))
    
    if (emptyCount > 0) {
      list.push({ name: '__EMPTY__', count: emptyCount })
    }
    return list
  }, [initialProducts])

  const availableSizes = useMemo(() => {
    const counts = new Map<string, number>()
    let emptyCount = 0
    initialProducts.forEach(p => {
      const s = p.size?.trim()
      if (s) {
        counts.set(s, (counts.get(s) || 0) + 1)
      } else {
        emptyCount++
      }
    })
    const list = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => compareSizes(a.name, b.name))
    
    if (emptyCount > 0) {
      list.push({ name: '__EMPTY__', count: emptyCount })
    }
    return list
  }, [initialProducts])

  const availableMarketplaces = useMemo(() => {
    const s = new Set<string>()
    initialProducts.forEach(p => {
      if (p.marketplaces) {
        p.marketplaces.forEach((m: string) => s.add(m))
      }
    })
    return Array.from(s).sort()
  }, [initialProducts])
  const [sortColumn, setSortColumn] = useState<string>('createdAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [showBulkCustomsModal, setShowBulkCustomsModal] = useState(false)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [bulkHsCode, setBulkHsCode] = useState('')
  const [bulkOrigin, setBulkOrigin] = useState('DE')
  const [isBulkUpdatingCustoms, setIsBulkUpdatingCustoms] = useState(false)
  const [syncingProductId, setSyncingProductId] = useState<string | null>(null)

  
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [bulkStock, setBulkStock] = useState('')
  const [bulkMsrp, setBulkMsrp] = useState('')
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkReducedPrice, setBulkReducedPrice] = useState('')
  const [bulkSaleStartDate, setBulkSaleStartDate] = useState('')
  const [bulkSaleEndDate, setBulkSaleEndDate] = useState('')
  const [isBulkEditing, setIsBulkEditing] = useState(false)

  const handleBulkEditSubmit = async () => {
    setIsBulkEditing(true)
    try {
      const { bulkUpdateStockAndPrice } = await import('@/app/actions/products')
      
      const newSaleStartDate = bulkSaleStartDate ? new Date(bulkSaleStartDate) : undefined
      const newSaleEndDate = bulkSaleEndDate ? new Date(bulkSaleEndDate) : undefined
      const newStock = bulkStock.trim() !== '' ? Math.max(0, parseInt(bulkStock)) : undefined
      let newPrice: number | undefined
      let newReducedPrice: number | undefined
      let parsedMsrp = undefined;
      if (bulkMsrp.trim() !== '') {
        const parsed = parseFloat(bulkMsrp.replace(',', '.'))
        if (!isNaN(parsed)) parsedMsrp = Math.max(0, parsed)
      }
      if (bulkPrice.trim() !== '') {
        const parsed = parseFloat(bulkPrice.replace(',', '.'))
        if (!isNaN(parsed)) newPrice = Math.max(0, parsed)
      }
      if (bulkReducedPrice.trim() !== '') {
        const parsed = parseFloat(bulkReducedPrice.replace(',', '.'))
        if (!isNaN(parsed)) newReducedPrice = Math.max(0, parsed)
      }

      if (newStock === undefined && parsedMsrp === undefined && newPrice === undefined && newReducedPrice === undefined && newSaleStartDate === undefined && newSaleEndDate === undefined) {
        showToast('Keine Änderungen eingegeben', 'info')
        setIsBulkEditing(false)
        return
      }

      await bulkUpdateStockAndPrice(Array.from(selectedProductIds), newStock, newPrice, newReducedPrice, parsedMsrp, newSaleStartDate, newSaleEndDate)
      setShowBulkEditModal(false)
      setBulkStock('')
      setBulkMsrp('')
      setBulkPrice('')
      setBulkReducedPrice('')
      showToast('Bestand/Preis erfolgreich für ausgewählte Produkte aktualisiert', 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      showToast('Fehler beim Aktualisieren der Daten', 'error')
    } finally {
      setIsBulkEditing(false)
    }
  }

  const handleBulkCustomsUpdate = async () => {
    setIsBulkUpdatingCustoms(true)
    try {
      const { bulkUpdateCustomsData } = await import('@/app/actions/products')
      await bulkUpdateCustomsData(Array.from(selectedProductIds), bulkHsCode, bulkOrigin)
      setShowBulkCustomsModal(false)
      setBulkHsCode('')
      setBulkOrigin('DE')
      showToast('Zolldaten erfolgreich aktualisiert', 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      showToast('Fehler beim Aktualisieren der Zolldaten', 'error')
    } finally {
      setIsBulkUpdatingCustoms(false)
    }
  }

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(current => current?.message === message ? null : current)
    }, 3000)
  }

  const productsToMerge = useMemo(() => {
    if (selectedProductIds.size !== 2) return []
    const ids = Array.from(selectedProductIds)
    return ids.map(id => initialProducts.find(p => p.id === id)).filter(Boolean) as Product[]
  }, [initialProducts, selectedProductIds])

  const handleMerge = async (masterId: string, sourceId: string) => {
    const { mergeProductsAction } = await import('@/app/actions/products')
    const res = await mergeProductsAction(masterId, sourceId)
    if (res.success) {
      showToast('Produkte erfolgreich zusammengefasst!', 'success')
      setSelectedProductIds(new Set())
      setShowMergeModal(false)
      router.refresh()
    } else {
      throw new Error(res.error || 'Fehler beim Zusammenfassen')
    }
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

  const handleSingleSync = async (productId: string) => {
    setSyncingProductId(productId)
    showToast('Sync wird gestartet...', 'info')
    try {
      const { triggerMarketplaceSyncForProducts } = await import('@/app/actions/products')
      const result = await triggerMarketplaceSyncForProducts([productId])
      if (result.failedMarketplaces && result.failedMarketplaces.length > 0) {
        showToast(`Sync teilweise fehlgeschlagen (${result.failedMarketplaces.map((f: any) => f.name).join(', ')})`, 'error')
      } else if (result.totalUpdatesSent > 0) {
        showToast(`Sync erfolgreich!`, 'success')
      } else {
        showToast(`Keine Marktplätze für Sync konfiguriert.`, 'info')
      }
    } catch (error) {
      showToast('Fehler beim Sync', 'error')
    } finally {
      setSyncingProductId(null)
      setOpenMenuId(null)
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

    if (marketplaceFilter !== 'all') {
      result = result.filter(p => p.marketplaces && p.marketplaces.includes(marketplaceFilter))
    }

    if (selectedColors.size > 0) {
      result = result.filter(p => {
        const c = p.color?.trim()
        if (!c) {
          return selectedColors.has('__EMPTY__')
        }
        return selectedColors.has(c)
      })
    }

    if (selectedSizes.size > 0) {
      result = result.filter(p => {
        const s = p.size?.trim()
        if (!s) {
          return selectedSizes.has('__EMPTY__')
        }
        return selectedSizes.has(s)
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
          if (searchField === 'color') {
            return (p.color && p.color.toLowerCase().includes(term))
          }
          if (searchField === 'size') {
            return (p.size && p.size.toLowerCase().includes(term))
          }
          if (searchField === 'ean') {
            return (p.ean && p.ean.toLowerCase().includes(term)) || (p.mappingEans && p.mappingEans.toLowerCase().includes(term))
          }
          return (p.sku && p.sku.toLowerCase().includes(term)) || 
            (p.title && p.title.toLowerCase().includes(term)) || 
            (p.color && p.color.toLowerCase().includes(term)) || 
            (p.size && p.size.toLowerCase().includes(term)) || 
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
      
      // Secondary sort by ID to ensure stable order when values are equal
      if (a.id < b.id) return -1
      if (a.id > b.id) return 1
      return 0
    })

    return result
  }, [initialProducts, searchQuery, sortColumn, sortDirection, searchField, syncFilter, marketplaceFilter, selectedColors, selectedSizes])

  const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
    sku: 140,
    title: 250,
    color: 110,
    size: 90,
    currentStock: 110,
    msrp: 100,
    price: 130,
    reducedPrice: 140,
    saleStartDate: 150,
    updatedAt: 130,
    actions: 160,
  }

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS)
  const [activeResizingColumn, setActiveResizingColumn] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('theomnistack_product_col_widths')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (typeof parsed === 'object' && parsed !== null) {
          setColumnWidths(prev => ({ ...prev, ...parsed }))
        }
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  const handleResizeStart = (e: React.MouseEvent, column: string) => {
    e.preventDefault()
    e.stopPropagation()
    setActiveResizingColumn(column)

    const startX = e.clientX
    const startWidth = columnWidths[column] || DEFAULT_COLUMN_WIDTHS[column] || 140

    const minWidths: Record<string, number> = {
      sku: 90,
      title: 140,
      color: 80,
      size: 70,
      currentStock: 80,
      msrp: 75,
      price: 85,
      reducedPrice: 100,
      saleStartDate: 110,
      updatedAt: 95,
      actions: 120,
    }
    const minW = minWidths[column] || 70

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault()
      const diff = moveEvent.clientX - startX
      const newW = Math.max(minW, startWidth + diff)
      setColumnWidths(prev => ({
        ...prev,
        [column]: newW,
      }))
    }

    const onMouseUp = () => {
      setActiveResizingColumn(null)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try {
        setColumnWidths(latest => {
          localStorage.setItem('theomnistack_product_col_widths', JSON.stringify(latest))
          return latest
        })
      } catch (err) {
        console.error(err)
      }
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleResetWidth = (e: React.MouseEvent, column: string) => {
    e.preventDefault()
    e.stopPropagation()
    const def = DEFAULT_COLUMN_WIDTHS[column]
    if (def) {
      setColumnWidths(prev => {
        const next = { ...prev, [column]: def }
        try {
          localStorage.setItem('theomnistack_product_col_widths', JSON.stringify(next))
        } catch (err) {}
        return next
      })
    }
  }

  const handleResetAllWidths = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS)
    try {
      localStorage.removeItem('theomnistack_product_col_widths')
    } catch (err) {}
    showToast('Spaltenbreiten zurückgesetzt', 'info')
  }

  const isColumnsCustomized = useMemo(() => {
    return Object.keys(DEFAULT_COLUMN_WIDTHS).some(
      key => columnWidths[key] && Math.abs(columnWidths[key] - DEFAULT_COLUMN_WIDTHS[key]) > 2
    )
  }, [columnWidths])

  const totalTableWidth = useMemo(() => {
    return 48 + 40 + Object.values(columnWidths).reduce((a, b) => a + b, 0)
  }, [columnWidths])

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ChevronUp className="w-3 h-3 opacity-20" />
    return sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 text-cyan-600" /> : <ChevronDown className="w-3 h-3 text-cyan-600" />
  }

  const Th = ({ children, column, className = "", resizable = true, filterNode }: { children: React.ReactNode, column: string, className?: string, resizable?: boolean, filterNode?: React.ReactNode }) => {
    const width = columnWidths[column]
    const isResizing = activeResizingColumn === column

    return (
      <th 
        style={width ? { width: `${width}px`, minWidth: `${width}px` } : undefined}
        className={`relative px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors select-none group/th ${className}`}
        onClick={() => toggleSort(column)}
      >
        <div className={`flex items-center gap-1.5 ${className.includes('text-right') ? 'justify-end' : ''}`}>
          <span className="truncate">{children}</span>
          <SortIcon column={column} />
          {filterNode}
        </div>
        {resizable && (
          <div
            className={`absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-20 flex items-center justify-center hover:bg-cyan-500/20 transition-colors ${isResizing ? 'bg-cyan-500/30' : ''}`}
            onMouseDown={(e) => handleResizeStart(e, column)}
            onDoubleClick={(e) => handleResetWidth(e, column)}
            onClick={(e) => e.stopPropagation()}
            title="Spaltenbreite anpassen (ziehen) • Doppelklick zum Zurücksetzen"
          >
            <div className={`w-[2px] h-4 rounded-full transition-colors ${isResizing ? 'bg-cyan-500' : 'bg-slate-300/80 group-hover/th:bg-cyan-400'}`} />
          </div>
        )}
      </th>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-3 items-center w-full">
          <select
            value={searchField}
            onChange={(e) => setSearchField(e.target.value as any)}
            className="w-36 px-3 py-2 pr-8 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-slate-900 font-medium"
          >
            <option value="all">Alle Felder</option>
            <option value="sku">SKU</option>
            <option value="title">Titel</option>
            <option value="color">Farbe</option>
            <option value="size">Größe</option>
            <option value="ean">EAN</option>
          </select>
          <select
            value={syncFilter}
            onChange={(e) => setSyncFilter(e.target.value as any)}
            className="w-40 px-3 py-2 pr-8 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-slate-900 font-medium"
          >
            <option value="all">Alle Sync-Stati</option>
            <option value="stock_on">Bestand Sync: AN</option>
            <option value="stock_off">Bestand Sync: AUS</option>
            <option value="price_on">Preis Sync: AN</option>
            <option value="price_off">Preis Sync: AUS</option>
          </select>
          {availableMarketplaces.length > 0 && (
            <select
              value={marketplaceFilter}
              onChange={(e) => setMarketplaceFilter(e.target.value)}
              className="w-40 px-3 py-2 pr-8 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-slate-900 font-medium"
            >
              <option value="all">Alle Marktplätze</option>
              {availableMarketplaces.map(m => (
                <option key={m} value={m}>
                  {m.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
          )}

          {/* Color Facet Filter */}
          <MultiSelectFacetFilter
            title="Farbe"
            icon={<Palette className="w-3.5 h-3.5 text-purple-600" />}
            items={availableColors}
            selected={selectedColors}
            onChange={setSelectedColors}
            placeholderSearch="Farbe suchen..."
            emptyLabel="Ohne Farbe"
            isColor={true}
            variant="toolbar"
            isOpen={activeFacetFilter === 'toolbar_color'}
            onToggle={() => setActiveFacetFilter(activeFacetFilter === 'toolbar_color' ? null : 'toolbar_color')}
            onClose={() => setActiveFacetFilter(null)}
          />

          {/* Size Facet Filter */}
          <MultiSelectFacetFilter
            title="Größe"
            icon={<Tag className="w-3.5 h-3.5 text-cyan-600" />}
            items={availableSizes}
            selected={selectedSizes}
            onChange={setSelectedSizes}
            placeholderSearch="Größe suchen..."
            emptyLabel="Ohne Größe"
            isColor={false}
            variant="toolbar"
            isOpen={activeFacetFilter === 'toolbar_size'}
            onToggle={() => setActiveFacetFilter(activeFacetFilter === 'toolbar_size' ? null : 'toolbar_size')}
            onClose={() => setActiveFacetFilter(null)}
          />

          <div className="relative flex-1 min-w-[200px] flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                placeholder={searchField === 'all' ? "SKU, Titel oder EAN suchen..." : `${searchField.toUpperCase()} suchen...`} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-slate-900 placeholder:text-slate-500 font-medium"
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
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
              onClick={(e) => e.preventDefault()}
            >
              Suchen
            </button>
            {isColumnsCustomized && (
              <button
                onClick={handleResetAllWidths}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                title="Alle Spaltenbreiten auf Standard zurücksetzen"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                Spalten zurücksetzen
              </button>
            )}
          </div>
        </div>

        {/* Active Filter Chips */}
        {(selectedColors.size > 0 || selectedSizes.size > 0 || syncFilter !== 'all' || marketplaceFilter !== 'all' || searchQuery) && (
          <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-slate-100 text-xs">
            <span className="font-semibold text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              Aktive Filter:
            </span>
            {Array.from(selectedColors).map(color => (
              <span key={color} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 font-semibold shadow-xs">
                {getColorDot(color) && <span className="w-2 h-2 rounded-full border border-slate-300" style={{ backgroundColor: getColorDot(color)! }} />}
                <span>Farbe: {color === '__EMPTY__' ? 'Ohne Farbe' : color}</span>
                <button 
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedColors)
                    next.delete(color)
                    setSelectedColors(next)
                  }} 
                  className="hover:text-purple-900 ml-0.5 font-bold cursor-pointer"
                  title="Diesen Filter entfernen"
                >
                  ✕
                </button>
              </span>
            ))}
            {Array.from(selectedSizes).map(size => (
              <span key={size} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-200 font-semibold shadow-xs">
                <span>Größe: {size === '__EMPTY__' ? 'Ohne Größe' : size}</span>
                <button 
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedSizes)
                    next.delete(size)
                    setSelectedSizes(next)
                  }} 
                  className="hover:text-cyan-900 ml-0.5 font-bold cursor-pointer"
                  title="Diesen Filter entfernen"
                >
                  ✕
                </button>
              </span>
            ))}
            {syncFilter !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                <span>Sync: {syncFilter}</span>
                <button 
                  type="button"
                  onClick={() => setSyncFilter('all')} 
                  className="hover:text-slate-900 ml-0.5 font-bold cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}
            {marketplaceFilter !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                <span>Marktplatz: {marketplaceFilter}</span>
                <button 
                  type="button"
                  onClick={() => setMarketplaceFilter('all')} 
                  className="hover:text-slate-900 ml-0.5 font-bold cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedColors(new Set())
                setSelectedSizes(new Set())
                setSyncFilter('all')
                setMarketplaceFilter('all')
                setSearchQuery('')
              }}
              className="text-xs text-rose-600 hover:text-rose-700 font-semibold underline underline-offset-2 ml-1 cursor-pointer"
            >
              Alle Filter zurücksetzen
            </button>
            <span className="text-slate-400 text-xs ml-auto font-medium">
              {filteredAndSortedProducts.length} von {initialProducts.length} Produkten
            </span>
          </div>
        )}
        
        {selectedProductIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-top-2 pt-4 mt-4 border-t border-slate-100">
            <span className="text-sm font-medium text-slate-500">
              {selectedProductIds.size} ausgewählt
            </span>
            <div className="flex items-center gap-3 border-r border-slate-200 pr-3">
              <div className="flex items-center gap-1 bg-slate-100/70 p-1 rounded-lg border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 px-2 whitespace-nowrap">Bestand-Sync:</span>
                <button
                  onClick={async () => {
                    const { bulkToggleProductSync } = await import('@/app/actions/products');
                    await bulkToggleProductSync(Array.from(selectedProductIds), 'stock', true);
                    showToast('Bestand-Sync aktiviert', 'success');
                  }}
                  className="px-3 py-1 text-xs font-bold rounded-md bg-white text-emerald-600 hover:bg-emerald-50 border border-slate-200 shadow-sm transition-colors whitespace-nowrap"
                >
                  AN
                </button>
                <button
                  onClick={async () => {
                    const { bulkToggleProductSync } = await import('@/app/actions/products');
                    await bulkToggleProductSync(Array.from(selectedProductIds), 'stock', false);
                    showToast('Bestand-Sync deaktiviert', 'success');
                  }}
                  className="px-3 py-1 text-xs font-bold rounded-md bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 shadow-sm transition-colors whitespace-nowrap"
                >
                  AUS
                </button>
              </div>

              <div className="flex items-center gap-1 bg-slate-100/70 p-1 rounded-lg border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 px-2 whitespace-nowrap">Preis-Sync:</span>
                <button
                  onClick={async () => {
                    const { bulkToggleProductSync } = await import('@/app/actions/products');
                    await bulkToggleProductSync(Array.from(selectedProductIds), 'price', true);
                    showToast('Preis-Sync aktiviert', 'success');
                  }}
                  className="px-3 py-1 text-xs font-bold rounded-md bg-white text-emerald-600 hover:bg-emerald-50 border border-slate-200 shadow-sm transition-colors whitespace-nowrap"
                >
                  AN
                </button>
                <button
                  onClick={async () => {
                    const { bulkToggleProductSync } = await import('@/app/actions/products');
                    await bulkToggleProductSync(Array.from(selectedProductIds), 'price', false);
                    showToast('Preis-Sync deaktiviert', 'success');
                  }}
                  className="px-3 py-1 text-xs font-bold rounded-md bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 shadow-sm transition-colors whitespace-nowrap"
                >
                  AUS
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowBulkCustomsModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-sm font-semibold border border-indigo-200"
            >
              <FileText className="w-4 h-4" />
              Zolldaten setzen
            </button>
            {selectedProductIds.size === 2 && (
              <button
                onClick={() => {
                  if (productsToMerge.length !== 2) {
                    showToast('Bitte wählen Sie genau 2 Produkte aus der Liste aus.', 'error')
                    return
                  }
                  setShowMergeModal(true)
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors text-sm font-semibold border border-purple-200"
              >
                <GitMerge className="w-4 h-4" />
                Zusammenfassen
              </button>
            )}

            <button
              onClick={() => setShowBulkEditModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-600 hover:bg-cyan-100 transition-colors text-sm font-semibold border border-cyan-200"
            >
              <Package className="w-4 h-4" />
              Bestand/Preis anpassen
            </button>

            <button
              onClick={async () => {
                
                const { triggerMarketplaceSyncForProducts } = await import('@/app/actions/products');
                showToast('Sync wird gestartet, bitte warten...', 'info');
                try {
                  const productIds = Array.from(selectedProductIds);
                  const chunkSize = 20;
                  const failed = [];
                  for (let i = 0; i < productIds.length; i += chunkSize) {
                    const chunk = productIds.slice(i, i + chunkSize);
                    const result = await triggerMarketplaceSyncForProducts(chunk);
                    if (result.failedMarketplaces && result.failedMarketplaces.length > 0) {
                      failed.push(...result.failedMarketplaces);
                    }
                  }
                  
                  if (failed.length > 0) {
                    showToast(`Sync mit Fehlern beendet. Bitte Logs prüfen.`, 'error')
                  } else {
                    showToast(`Sync für ${selectedProductIds.size} Produkte erfolgreich!`, 'success');
                  }
                } catch (error) {

                  showToast('Fehler beim Sync', 'error');
                }
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors text-sm font-semibold border border-emerald-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l5.67-1.35"/></svg>
              Jetzt synchronisieren
            </button>
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

      <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${(openMenuId || activeFacetFilter) ? '' : 'overflow-hidden'}`}>
        <div className={(openMenuId || activeFacetFilter) ? '' : 'overflow-x-auto'}>
          <table 
            style={{ minWidth: '100%', width: `${totalTableWidth}px` }}
            className="text-left border-collapse table-fixed"
          >
            <colgroup>
              <col style={{ width: '48px' }} />
              <col style={{ width: '40px' }} />
              <col style={{ width: `${columnWidths.sku || 140}px` }} />
              <col style={{ width: `${columnWidths.title || 250}px` }} />
              <col style={{ width: `${columnWidths.color || 110}px` }} />
              <col style={{ width: `${columnWidths.size || 90}px` }} />
              <col style={{ width: `${columnWidths.currentStock || 110}px` }} />
              <col style={{ width: `${columnWidths.msrp || 100}px` }} />
              <col style={{ width: `${columnWidths.price || 130}px` }} />
              <col style={{ width: `${columnWidths.reducedPrice || 140}px` }} />
              <col style={{ width: `${columnWidths.saleStartDate || 150}px` }} />
              <col style={{ width: `${columnWidths.updatedAt || 130}px` }} />
              <col style={{ width: `${columnWidths.actions || 160}px` }} />
            </colgroup>
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
                <Th 
                  column="color"
                  filterNode={
                    <MultiSelectFacetFilter
                      title="Farbe"
                      icon={<Palette className="w-3.5 h-3.5 text-purple-600" />}
                      items={availableColors}
                      selected={selectedColors}
                      onChange={setSelectedColors}
                      placeholderSearch="Farbe suchen..."
                      emptyLabel="Ohne Farbe"
                      isColor={true}
                      variant="header"
                      isOpen={activeFacetFilter === 'header_color'}
                      onToggle={() => setActiveFacetFilter(activeFacetFilter === 'header_color' ? null : 'header_color')}
                      onClose={() => setActiveFacetFilter(null)}
                    />
                  }
                >
                  Farbe
                </Th>
                <Th 
                  column="size"
                  filterNode={
                    <MultiSelectFacetFilter
                      title="Größe"
                      icon={<Tag className="w-3.5 h-3.5 text-cyan-600" />}
                      items={availableSizes}
                      selected={selectedSizes}
                      onChange={setSelectedSizes}
                      placeholderSearch="Größe suchen..."
                      emptyLabel="Ohne Größe"
                      isColor={false}
                      variant="header"
                      isOpen={activeFacetFilter === 'header_size'}
                      onToggle={() => setActiveFacetFilter(activeFacetFilter === 'header_size' ? null : 'header_size')}
                      onClose={() => setActiveFacetFilter(null)}
                    />
                  }
                >
                  Größe
                </Th>
                <Th column="currentStock">Bestand</Th>
                <Th column="msrp">UVP</Th>
                <Th column="price">Standard Preis</Th>
                <Th column="reducedPrice">Reduzierter Preis</Th>
                <Th column="saleStartDate">Aktionszeitraum</Th>
                <Th column="updatedAt">Letzte Änderung</Th>
                <th 
                  style={{ width: `${columnWidths.actions || 160}px`, minWidth: `${columnWidths.actions || 160}px` }}
                  className="relative px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right select-none group/th"
                >
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-3 cursor-col-resize z-20 flex items-center justify-center hover:bg-cyan-500/20 transition-colors ${activeResizingColumn === 'actions' ? 'bg-cyan-500/30' : ''}`}
                    onMouseDown={(e) => handleResizeStart(e, 'actions')}
                    onDoubleClick={(e) => handleResetWidth(e, 'actions')}
                    onClick={(e) => e.stopPropagation()}
                    title="Spaltenbreite anpassen (ziehen) • Doppelklick zum Zurücksetzen"
                  >
                    <div className={`w-[2px] h-4 rounded-full transition-colors ${activeResizingColumn === 'actions' ? 'bg-cyan-500' : 'bg-slate-300/80 group-hover/th:bg-cyan-400'}`} />
                  </div>
                  Aktion
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-slate-500">
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
                          <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
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
                        <div className={`font-semibold text-slate-900 transition-all ${isExpanded ? 'whitespace-normal break-words' : 'line-clamp-1'}`}>{product.title}</div>
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
                        <ColorEditor product={product} onToast={showToast} />
                      </td>
                      <td className="px-6 py-4">
                        <SizeEditor product={product} onToast={showToast} />
                      </td>
                      <td className="px-6 py-4">
                        <StockEditor product={product} onToast={showToast} />
                      </td>
                      <td className="px-6 py-4">
                        <MsrpEditor product={product} onToast={showToast} />
                      </td>
                      <td className="px-6 py-4">
                        <PriceEditor product={product} onToast={showToast} />
                      </td>
                      <td className="px-6 py-4">
                        <ReducedPriceEditor product={product} onToast={showToast} />
                      </td>
                      <td className="px-6 py-4">
                        <ReducedPriceDatesEditor product={product} onToast={showToast} />
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
                                <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 text-left overflow-hidden">
                                  <button 
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (syncingProductId !== product.id) {
                                        handleSingleSync(product.id);
                                      }
                                    }}
                                    disabled={syncingProductId === product.id}
                                    className="w-full text-left px-4 py-2.5 text-sm transition-colors font-medium text-slate-700 hover:bg-slate-50 border-b border-slate-100 flex items-center gap-2 disabled:opacity-50"
                                  >
                                    {syncingProductId === product.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                                    ) : (
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l5.67-1.35"/></svg>
                                    )}
                                    {syncingProductId === product.id ? 'Synchronisiert...' : 'Jetzt synchronisieren'}
                                  </button>
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
                        <td colSpan={13} className="p-0">
                          <div className="px-14 py-6 animate-in slide-in-from-top-2 fade-in duration-200">
                            {/* Prominently display full title when expanded */}
                            <div className="mb-5 pb-4 border-b border-slate-200/80 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                <Package className="w-3.5 h-3.5 text-cyan-600" />
                                Vollständiger Produkttitel
                              </div>
                              <h3 className="text-base font-bold text-slate-900 leading-snug break-words">
                                {product.title}
                              </h3>
                            </div>

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
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Tag className="w-3.5 h-3.5"/> Farbe</span>
                                    <span className="text-sm text-slate-900 font-medium">{product.color || '-'}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Tag className="w-3.5 h-3.5"/> Größe</span>
                                    <span className="text-sm text-slate-900 font-mono font-bold">{product.size || '-'}</span>
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
    </div>

      
      {showBulkEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowBulkEditModal(false)}>
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200 relative overflow-hidden text-left" 
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-cyan-100 flex items-center justify-center mb-4">
                <Package className="w-6 h-6 text-cyan-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-xl mb-2">Werte für {selectedProductIds.size} Produkte anpassen</h3>
              <p className="text-slate-500 text-sm mb-6">
                Lass ein Feld leer, wenn du diesen Wert nicht verändern möchtest.
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Neuer Bestand</label>
                  <input 
                    type="number" 
                    min="0"
                    value={bulkStock} 
                    onChange={e => setBulkStock(e.target.value)} 
                    placeholder="z.B. 100" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Neue UVP (Brutto in €)</label>
                  <input 
                    type="text" 
                    value={bulkMsrp} 
                    onChange={e => setBulkMsrp(e.target.value)} 
                    placeholder="z.B. 24.90" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" 
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-700">Neuer Standard-Preis (Brutto in €)</label>
                    <button 
                      type="button" 
                      onClick={() => { if(bulkMsrp) setBulkPrice(bulkMsrp); }} 
                      className="text-xs text-cyan-600 hover:text-cyan-700 font-medium px-2 py-1 bg-cyan-50 hover:bg-cyan-100 rounded-md transition-colors"
                      title="Kopiert den Wert aus dem UVP-Feld"
                    >
                      UVP übernehmen
                    </button>
                  </div>
                  <input 
                    type="text" 
                    value={bulkPrice} 
                    onChange={e => setBulkPrice(e.target.value)} 
                    placeholder="z.B. 19.90" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" 
                  />
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Aktion Start (Von)</label>
                    <input 
                      type="date" 
                      value={bulkSaleStartDate} 
                      onChange={e => setBulkSaleStartDate(e.target.value)} 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Aktion Ende (Bis)</label>
                    <input 
                      type="date" 
                      value={bulkSaleEndDate} 
                      onChange={e => setBulkSaleEndDate(e.target.value)} 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900" 
                    />
                  </div>
                </div>

                <label className="text-sm font-semibold text-slate-700">Neuer Aktions-Preis (Brutto in €)</label>
                  <input 
                    type="text" 
                    value={bulkReducedPrice} 
                    onChange={e => setBulkReducedPrice(e.target.value)} 
                    placeholder="z.B. 14.90 (0 zum Löschen)" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" 
                  />
                </div>

              </div>
            </div>
            
            <div className="p-4 sm:p-6 bg-slate-50 flex flex-col sm:flex-row gap-3 sm:justify-end border-t border-slate-100">
              <button 
                onClick={() => setShowBulkEditModal(false)}
                disabled={isBulkEditing}
                className="px-6 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50 w-full sm:w-auto"
              >
                Abbrechen
              </button>
              <button 
                onClick={handleBulkEditSubmit}
                disabled={isBulkEditing}
                className="px-6 py-2.5 rounded-xl font-semibold bg-cyan-600 text-white hover:bg-cyan-700 transition-colors disabled:opacity-50 shadow-sm flex justify-center items-center gap-2 w-full sm:w-auto"
              >
                {isBulkEditing && <Loader2 className="w-4 h-4 animate-spin" />}
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkCustomsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowBulkCustomsModal(false)}>
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200 relative overflow-hidden text-left" 
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-xl mb-2">Zolldaten für {selectedProductIds.size} Produkte setzen</h3>
              <p className="text-slate-500 text-sm mb-6">
                Die eingegebenen Zolldaten werden für alle {selectedProductIds.size} ausgewählten Produkte übernommen. Bestehende Einträge werden überschrieben.
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Zolltarifnr. (HS-Code)</label>
                  <input 
                    type="text" 
                    value={bulkHsCode} 
                    onChange={e => setBulkHsCode(e.target.value)} 
                    placeholder="z.B. 64041100" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Ursprungsland</label>
                  <input 
                    type="text" 
                    value={bulkOrigin} 
                    onChange={e => setBulkOrigin(e.target.value)} 
                    placeholder="z.B. DE" 
                    maxLength={2} 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" 
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => setShowBulkCustomsModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
                disabled={isBulkUpdatingCustoms}
              >
                Abbrechen
              </button>
              <button 
                onClick={handleBulkCustomsUpdate}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 transition-all flex items-center gap-2"
                disabled={isBulkUpdatingCustoms}
              >
                {isBulkUpdatingCustoms ? 'Speichert...' : 'Zolldaten anwenden'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Merge Products Modal */}
      <MergeProductsModal
        isOpen={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        productsToMerge={productsToMerge}
        onMerge={handleMerge}
      />

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


// --- Merge Products Modal ---
function MergeProductsModal({
  isOpen,
  onClose,
  productsToMerge,
  onMerge
}: {
  isOpen: boolean
  onClose: () => void
  productsToMerge: any[]
  onMerge: (masterId: string, sourceId: string) => Promise<void>
}) {
  const [masterId, setMasterId] = React.useState<string>('')
  const [isMerging, setIsMerging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (isOpen && productsToMerge.length === 2) {
      setMasterId(productsToMerge[0].id)
      setError(null)
    }
  }, [isOpen, productsToMerge])

  if (!isOpen) return null

  if (productsToMerge.length !== 2) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 text-center">
          <p className="text-slate-800 font-semibold mb-4">Es müssen genau 2 Produkte ausgewählt sein, um sie zusammenzufassen.</p>
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl">
            Schließen
          </button>
        </div>
      </div>
    )
  }

  const p1 = productsToMerge[0]
  const p2 = productsToMerge[1]
  const masterProduct = productsToMerge.find(p => p.id === masterId) || p1
  const sourceProduct = productsToMerge.find(p => p.id !== masterId) || p2
  const combinedStock = (Number(p1?.currentStock || 0) + Number(p2?.currentStock || 0))

  const handleConfirm = async () => {
    if (!masterId) return
    setIsMerging(true)
    setError(null)
    try {
      const sourceId = productsToMerge.find(p => p.id !== masterId)!.id
      await onMerge(masterId, sourceId)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsMerging(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
              <GitMerge className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Produkte zusammenfassen</h2>
              <p className="text-sm text-slate-500">Wähle das Hauptprodukt aus. Das andere Produkt wird in dieses integriert.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <strong>Achtung:</strong> Alle Marktplatz-Verknüpfungen des zweiten Produkts werden auf das Hauptprodukt übertragen. Der Lagerbestand wird addiert. Das zweite Produkt wird gelöscht. Diese Aktion kann nicht rückgängig gemacht werden!
          </div>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-800">Welches Produkt soll das Hauptprodukt bleiben?</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[p1, p2].map(p => {
                const isSelected = masterId === p.id
                return (
                  <div 
                    key={p.id}
                    onClick={() => setMasterId(p.id)}
                    className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected 
                        ? 'border-purple-600 bg-purple-50/50 ring-2 ring-purple-600/20' 
                        : 'border-slate-200 hover:border-purple-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-mono text-xs font-bold text-purple-700 bg-purple-100/70 border border-purple-200 px-2 py-0.5 rounded-md">
                        {p.sku}
                      </span>
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                          Hauptprodukt
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">
                          Wird integriert
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-slate-900 text-sm line-clamp-2 leading-snug mb-3" title={p.title}>
                      {p.title}
                    </div>
                    
                    <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Bestand:</span>
                        <span className="font-bold text-slate-900">{p.currentStock || 0}</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Farbe:</span>
                        <span className="font-semibold text-slate-900">{p.color || '-'}</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Größe:</span>
                        <span className="font-semibold text-slate-900">{p.size || '-'}</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">EAN:</span>
                        <span className="font-mono text-slate-900">{p.ean || '-'}</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Preis:</span>
                        <span className="font-semibold text-slate-900">{p.price ? `${p.price} €` : '-'}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Merge Result Summary Preview */}
          <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-100 text-xs text-purple-900 space-y-1">
            <div className="font-bold text-purple-950 flex items-center gap-1.5 mb-1 text-sm">
              <CheckCircle2 className="w-4 h-4 text-purple-600" />
              Ergebnis nach dem Zusammenfassen
            </div>
            <div>
              <strong>Haupt-SKU:</strong> <span className="font-mono">{masterProduct.sku}</span> ({masterProduct.title})
            </div>
            <div>
              <strong>Kombinierter Lagerbestand:</strong> <span className="font-bold text-purple-700">{combinedStock}</span> Stück ({Number(masterProduct.currentStock || 0)} + {Number(sourceProduct.currentStock || 0)})
            </div>
            {(!masterProduct.color && sourceProduct.color) && (
              <div>
                <strong>Farbe geerbt:</strong> {sourceProduct.color}
              </div>
            )}
            {(!masterProduct.size && sourceProduct.size) && (
              <div>
                <strong>Größe geerbt:</strong> {sourceProduct.size}
              </div>
            )}
            <div>
              <strong>Marktplatz-Mappings:</strong> Alle Listings von <span className="font-mono">{sourceProduct.sku}</span> werden auf <span className="font-mono">{masterProduct.sku}</span> umgeleitet.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-slate-50">
          <button 
            onClick={onClose}
            disabled={isMerging}
            className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button 
            onClick={handleConfirm}
            disabled={!masterId || isMerging}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm shadow-purple-600/20"
          >
            {isMerging && <Loader2 className="w-4 h-4 animate-spin" />}
            Zusammenfassen
          </button>
        </div>
      </div>
    </div>
  )
}

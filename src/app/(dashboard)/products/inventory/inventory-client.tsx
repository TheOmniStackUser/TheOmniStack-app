'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ClipboardList,
  Download,
  Upload,
  FileSpreadsheet,
  FileText,
  Search,
  ChevronUp,
  ChevronDown,
  Package,
  Euro,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  Edit3,
  Save,
  Layers,
  MapPin,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
} from 'lucide-react'
import {
  downloadPurchasePriceTemplateAction,
  previewPurchasePriceUploadAction,
  applyInventoryUpdatesAction,
  exportInventoryAction,
  PurchasePricePreviewItem,
} from '@/app/actions/inventory'
import { updateProductPurchasePriceInline, updateProductStockInline } from '@/app/actions/products'
import { ProductsSubNav } from '../products-subnav'

export type InventoryProductItem = {
  id: string
  sku: string
  title: string
  ean: string | null
  color: string | null
  size: string | null
  brand: string | null
  category: string | null
  storageLocation: string | null
  currentStock: number
  price: number
  purchasePrice: number | null
  msrp: number | null
  reducedPrice: number | null
  taxRate: number
  isPreorder: boolean
  updatedAt: string
  mappedSkus: string[]
  mappingSkusSearch: string
  mappingEansSearch: string
  marketplaces: string[]
}

function formatMarketplaceName(name: string): string {
  const map: Record<string, string> = {
    otto: 'Otto',
    aboutyou: 'About You',
    amazon: 'Amazon',
    shopify: 'Shopify',
    ebay: 'eBay',
    etsy: 'Etsy',
    kaufland: 'Kaufland',
    mirakl_decathlon: 'Decathlon',
    mirakl_decathlon_eu: 'Decathlon EU',
    mirakl_mediamarkt: 'MediaMarkt',
    mirakl_custom: 'Mirakl Custom',
    woocommerce: 'WooCommerce',
    shopware: 'Shopware',
  }
  return map[name.toLowerCase()] || name
}

function formatCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-'
  return val.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €'
}

function triggerBase64Download(base64: string, filename: string, mimeType: string) {
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  const blob = new Blob([byteArray], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function InlinePurchasePriceCell({
  product,
  onSaved,
  onToast,
}: {
  product: InventoryProductItem
  onSaved: (productId: string, newPrice: number | null) => void
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [val, setVal] = useState(
    product.purchasePrice !== null && product.purchasePrice !== undefined
      ? product.purchasePrice.toFixed(2)
      : ''
  )
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isEditing) {
      setVal(
        product.purchasePrice !== null && product.purchasePrice !== undefined
          ? product.purchasePrice.toFixed(2)
          : ''
      )
    }
  }, [product.purchasePrice, isEditing])

  const handleSave = async () => {
    const trimmed = val.trim().replace(',', '.')
    const parsed = trimmed === '' ? null : Number(trimmed)
    if (trimmed !== '' && (parsed === null || isNaN(parsed) || parsed < 0)) {
      onToast('Bitte einen gültigen Einkaufspreis eingeben.', 'error')
      return
    }

    const oldVal = product.purchasePrice
    if (
      (parsed === null && oldVal === null) ||
      (parsed !== null && oldVal !== null && Math.abs(parsed - oldVal) < 0.005)
    ) {
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    try {
      await updateProductPurchasePriceInline(product.id, parsed)
      onSaved(product.id, parsed !== null ? Math.round(parsed * 100) / 100 : null)
      setIsEditing(false)
      onToast(`Einkaufspreis für ${product.sku} gespeichert`, 'success')
    } catch (err: any) {
      onToast(err.message || 'Fehler beim Speichern des Einkaufspreises', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isEditing) {
    const hasEk = product.purchasePrice !== null && product.purchasePrice !== undefined
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
          hasEk
            ? 'text-slate-900 hover:bg-cyan-50 border border-transparent hover:border-cyan-200'
            : 'text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 text-xs'
        }`}
        title="Klicken, um den Einkaufspreis manuell zu bearbeiten"
      >
        <span>{hasEk ? formatCurrency(product.purchasePrice) : 'EK hinterlegen'}</span>
        <Edit3 className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <div className="relative">
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') setIsEditing(false)
          }}
          disabled={isSaving}
          placeholder="0,00"
          className="w-24 px-2.5 py-1 text-sm border border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none rounded-lg font-semibold text-slate-900 placeholder:text-slate-500 bg-white text-right pr-6"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
          €
        </span>
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50 cursor-pointer"
        title="Speichern"
      >
        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => setIsEditing(false)}
        disabled={isSaving}
        className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
        title="Abbrechen"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function InlineStockCell({
  product,
  onSaved,
  onToast,
}: {
  product: InventoryProductItem
  onSaved: (productId: string, newStock: number) => void
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [val, setVal] = useState(String(product.currentStock || 0))
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isEditing) {
      setVal(String(product.currentStock || 0))
    }
  }, [product.currentStock, isEditing])

  const handleSave = async () => {
    const parsed = Math.max(0, parseInt(val, 10))
    if (isNaN(parsed)) {
      setIsEditing(false)
      return
    }
    if (parsed === product.currentStock) {
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    try {
      await updateProductStockInline(product.id, parsed)
      onSaved(product.id, parsed)
      setIsEditing(false)
      onToast(`Bestand für ${product.sku} auf ${parsed} aktualisiert`, 'success')
    } catch (err: any) {
      onToast(err.message || 'Fehler beim Speichern des Bestands', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="group inline-flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        title="Bestand manuell anpassen"
      >
        <span
          className={`w-2 h-2 rounded-full ${
            product.currentStock > 0 ? 'bg-emerald-500' : 'bg-rose-400'
          }`}
        />
        <span className="font-bold text-slate-900 border-b border-slate-300 border-dashed">
          {product.currentStock}
        </span>
        <Edit3 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input
        autoFocus
        type="number"
        min="0"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') setIsEditing(false)
        }}
        disabled={isSaving}
        className="w-20 px-2 py-1 text-sm border border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none rounded-lg font-bold text-slate-900 placeholder:text-slate-500 bg-white text-right"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors cursor-pointer"
      >
        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => setIsEditing(false)}
        disabled={isSaving}
        className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function InventoryClient({ initialProducts }: { initialProducts: InventoryProductItem[] }) {
  const router = useRouter()
  const [products, setProducts] = useState<InventoryProductItem[]>(initialProducts)

  useEffect(() => {
    setProducts(initialProducts)
  }, [initialProducts])

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all')
  const [ekFilter, setEkFilter] = useState<'all' | 'with_ek' | 'missing_ek'>('all')
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all')
  const [sortColumn, setSortColumn] = useState<string>('sku')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Selection & Bulk states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkEkModal, setShowBulkEkModal] = useState(false)
  const [bulkEkValue, setBulkEkValue] = useState('')
  const [isSavingBulkEk, setIsSavingBulkEk] = useState(false)

  // Quick-Edit mode (Tabellen-Schnellerfassung)
  const [isQuickEditMode, setIsQuickEditMode] = useState(false)
  const [quickEdits, setQuickEdits] = useState<
    Record<string, { purchasePrice?: string; currentStock?: string; storageLocation?: string }>
  >({})
  const [isSavingQuickEdits, setIsSavingQuickEdits] = useState(false)

  // Template Download / Upload Modal
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateFilter, setTemplateFilter] = useState<
    'all' | 'in_stock_missing_ek' | 'missing_ek' | 'in_stock'
  >('all')
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState<'xlsx' | 'csv' | null>(null)
  const [isParsingUpload, setIsParsingUpload] = useState(false)
  const [isApplyingUpload, setIsApplyingUpload] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<{
    fileName: string
    totalRowsInFile: number
    matchedCount: number
    changedPriceCount: number
    changedStockCount: number
    withValidPriceCount: number
    skippedEmptyPriceRows: number
    notFoundSkus: string[]
    items: PurchasePricePreviewItem[]
  } | null>(null)
  const [uploadAlsoUpdateStock, setUploadAlsoUpdateStock] = useState(false)
  const [uploadAlsoUpdateStorage, setUploadAlsoUpdateStorage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Export states
  const [isExporting, setIsExporting] = useState<'xlsx' | 'csv' | null>(null)

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(curr => (curr?.message === message ? null : curr))
    }, 4000)
  }

  const availableMarketplaces = useMemo(() => {
    const s = new Set<string>()
    products.forEach(p => p.marketplaces.forEach(m => s.add(m)))
    return Array.from(s).sort()
  }, [products])

  // Filtered & sorted products
  const filteredProducts = useMemo(() => {
    let list = [...products]

    if (stockFilter === 'in_stock') {
      list = list.filter(p => p.currentStock > 0)
    } else if (stockFilter === 'out_of_stock') {
      list = list.filter(p => p.currentStock <= 0)
    }

    if (ekFilter === 'with_ek') {
      list = list.filter(p => p.purchasePrice !== null && p.purchasePrice > 0)
    } else if (ekFilter === 'missing_ek') {
      list = list.filter(p => p.purchasePrice === null || p.purchasePrice <= 0)
    }

    if (marketplaceFilter !== 'all') {
      list = list.filter(p => p.marketplaces.includes(marketplaceFilter))
    }

    if (searchQuery.trim()) {
      const terms = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean)
      list = list.filter(p =>
        terms.every(
          t =>
            p.sku.toLowerCase().includes(t) ||
            p.title.toLowerCase().includes(t) ||
            (p.ean && p.ean.toLowerCase().includes(t)) ||
            (p.color && p.color.toLowerCase().includes(t)) ||
            (p.size && p.size.toLowerCase().includes(t)) ||
            (p.storageLocation && p.storageLocation.toLowerCase().includes(t)) ||
            p.mappingSkusSearch.toLowerCase().includes(t) ||
            p.mappingEansSearch.toLowerCase().includes(t)
        )
      )
    }

    list.sort((a, b) => {
      let aVal: any
      let bVal: any

      if (sortColumn === 'ekTotal') {
        aVal = a.purchasePrice !== null ? a.currentStock * a.purchasePrice : -1
        bVal = b.purchasePrice !== null ? b.currentStock * b.purchasePrice : -1
      } else if (sortColumn === 'vkTotal') {
        aVal = a.currentStock * a.price
        bVal = b.currentStock * b.price
      } else if (sortColumn === 'purchasePrice') {
        aVal = a.purchasePrice !== null ? a.purchasePrice : -1
        bVal = b.purchasePrice !== null ? b.purchasePrice : -1
      } else if (sortColumn === 'currentStock' || sortColumn === 'price') {
        aVal = a[sortColumn]
        bVal = b[sortColumn]
      } else if (sortColumn === 'margin') {
        const aNet = a.taxRate > 0 ? a.price / (1 + a.taxRate) : a.price
        const bNet = b.taxRate > 0 ? b.price / (1 + b.taxRate) : b.price
        aVal = a.purchasePrice !== null && aNet > 0 ? (aNet - a.purchasePrice) / aNet : -999
        bVal = b.purchasePrice !== null && bNet > 0 ? (bNet - b.purchasePrice) / bNet : -999
      } else {
        aVal = String((a as any)[sortColumn] || '').toLowerCase()
        bVal = String((b as any)[sortColumn] || '').toLowerCase()
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return a.sku.localeCompare(b.sku, 'de')
    })

    return list
  }, [products, stockFilter, ekFilter, marketplaceFilter, searchQuery, sortColumn, sortDirection])

  // Global & Filtered KPIs
  const kpis = useMemo(() => {
    let totalUnits = 0
    let inStockSkus = 0
    let totalEkValue = 0
    let totalVkGross = 0
    let totalVkNet = 0
    let skusWithEk = 0
    let inStockSkusMissingEk = 0

    for (const p of filteredProducts) {
      const stock = Math.max(0, p.currentStock)
      const hasEk = p.purchasePrice !== null && p.purchasePrice > 0
      const netPrice = p.taxRate > 0 ? p.price / (1 + p.taxRate) : p.price

      totalUnits += stock
      if (stock > 0) inStockSkus++
      if (hasEk) {
        skusWithEk++
        totalEkValue += stock * p.purchasePrice!
      } else if (stock > 0) {
        inStockSkusMissingEk++
      }

      totalVkGross += stock * p.price
      totalVkNet += stock * netPrice
    }

    const totalSkus = filteredProducts.length
    const missingEkCount = totalSkus - skusWithEk
    const ekCoveragePercent = totalSkus > 0 ? Math.round((skusWithEk / totalSkus) * 100) : 100
    const inStockSkusWithEk = inStockSkus - inStockSkusMissingEk
    const inStockEkCoveragePercent =
      inStockSkus > 0 ? Math.round((inStockSkusWithEk / inStockSkus) * 100) : 100
    const potentialProfit = totalVkNet - totalEkValue

    return {
      totalSkus,
      totalUnits,
      inStockSkus,
      inStockSkusWithEk,
      totalEkValue,
      totalVkGross,
      totalVkNet,
      skusWithEk,
      missingEkCount,
      inStockSkusMissingEk,
      ekCoveragePercent,
      inStockEkCoveragePercent,
      potentialProfit,
    }
  }, [filteredProducts])

  const toggleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)))
    }
  }

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  // Inline update handlers
  const handleInlinePriceSaved = (productId: string, newPrice: number | null) => {
    setProducts(prev =>
      prev.map(p => (p.id === productId ? { ...p, purchasePrice: newPrice } : p))
    )
    router.refresh()
  }

  const handleInlineStockSaved = (productId: string, newStock: number) => {
    setProducts(prev =>
      prev.map(p => (p.id === productId ? { ...p, currentStock: newStock } : p))
    )
    router.refresh()
  }

  // Quick-Edit handlers
  const handleQuickEditChange = (
    productId: string,
    field: 'purchasePrice' | 'currentStock' | 'storageLocation',
    value: string
  ) => {
    setQuickEdits(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }))
  }

  const quickEditChangedItems = useMemo(() => {
    const items: {
      productId: string
      purchasePrice?: number | null
      currentStock?: number | null
      storageLocation?: string | null
    }[] = []

    for (const [productId, edits] of Object.entries(quickEdits)) {
      const orig = products.find(p => p.id === productId)
      if (!orig) continue

      let changed = false
      const payloadItem: {
        productId: string
        purchasePrice?: number | null
        currentStock?: number | null
        storageLocation?: string | null
      } = { productId }

      if (edits.purchasePrice !== undefined) {
        const raw = edits.purchasePrice.trim().replace(',', '.')
        const parsed = raw === '' ? null : Number(raw)
        if (raw === '' && orig.purchasePrice !== null) {
          payloadItem.purchasePrice = null
          changed = true
        } else if (parsed !== null && !isNaN(parsed) && parsed >= 0) {
          const rounded = Math.round(parsed * 100) / 100
          if (orig.purchasePrice === null || Math.abs(orig.purchasePrice - rounded) >= 0.005) {
            payloadItem.purchasePrice = rounded
            changed = true
          }
        }
      }

      if (edits.currentStock !== undefined) {
        const parsedStock = parseInt(edits.currentStock, 10)
        if (!isNaN(parsedStock) && Math.max(0, parsedStock) !== orig.currentStock) {
          payloadItem.currentStock = Math.max(0, parsedStock)
          changed = true
        }
      }

      if (edits.storageLocation !== undefined) {
        const cleanLoc = edits.storageLocation.trim() || null
        if (cleanLoc !== (orig.storageLocation || null)) {
          payloadItem.storageLocation = cleanLoc
          changed = true
        }
      }

      if (changed) {
        items.push(payloadItem)
      }
    }

    return items
  }, [quickEdits, products])

  const handleSaveQuickEdits = async () => {
    if (quickEditChangedItems.length === 0) {
      showToast('Keine Änderungen zum Speichern vorhanden.', 'info')
      return
    }
    setIsSavingQuickEdits(true)
    try {
      const res = await applyInventoryUpdatesAction({
        items: quickEditChangedItems,
        updatePurchasePrice: true,
        updateStock: true,
        updateStorageLocation: true,
      })
      showToast(`${res.updatedCount} Produkte erfolgreich aktualisiert!`, 'success')
      setQuickEdits({})
      setIsQuickEditMode(false)
      router.refresh()
    } catch (err: any) {
      showToast(err.message || 'Fehler beim Speichern der Änderungen', 'error')
    } finally {
      setIsSavingQuickEdits(false)
    }
  }

  // Bulk EK modal submit
  const handleBulkEkSubmit = async () => {
    const clean = bulkEkValue.trim().replace(',', '.')
    const parsed = clean === '' ? null : Number(clean)
    if (clean !== '' && (parsed === null || isNaN(parsed) || parsed < 0)) {
      showToast('Bitte einen gültigen Einkaufspreis eingeben.', 'error')
      return
    }

    setIsSavingBulkEk(true)
    try {
      const items = Array.from(selectedIds).map(id => ({
        productId: id,
        purchasePrice: parsed !== null ? Math.round(parsed * 100) / 100 : null,
      }))
      const res = await applyInventoryUpdatesAction({
        items,
        updatePurchasePrice: true,
      })
      showToast(`Einkaufspreis für ${res.updatedCount} Produkte aktualisiert!`, 'success')
      setShowBulkEkModal(false)
      setBulkEkValue('')
      setSelectedIds(new Set())
      router.refresh()
    } catch (err: any) {
      showToast(err.message || 'Fehler beim Speichern', 'error')
    } finally {
      setIsSavingBulkEk(false)
    }
  }

  // Export Inventory (Excel & CSV)
  const handleExportInventory = async (format: 'xlsx' | 'csv', onlySelected = false) => {
    setIsExporting(format)
    try {
      const productIds =
        onlySelected && selectedIds.size > 0
          ? Array.from(selectedIds)
          : filteredProducts.map(p => p.id)

      const res = await exportInventoryAction({
        format,
        productIds,
        stockFilter,
        ekFilter,
      })

      triggerBase64Download(res.base64, res.filename, res.mimeType)
      showToast(
        `Inventur (${res.count} SKUs) als ${format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV (.csv)'} exportiert!`,
        'success'
      )
    } catch (err: any) {
      showToast(err.message || 'Fehler beim Exportieren der Inventur', 'error')
    } finally {
      setIsExporting(null)
    }
  }

  // Template Download (Excel & CSV)
  const handleDownloadTemplate = async (format: 'xlsx' | 'csv') => {
    setIsDownloadingTemplate(format)
    try {
      const res = await downloadPurchasePriceTemplateAction({
        format,
        filter: templateFilter,
      })
      triggerBase64Download(res.base64, res.filename, res.mimeType)
      showToast(
        `Vorlage mit ${res.count} zusammengefassten SKUs als ${
          format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV (.csv)'
        } heruntergeladen!`,
        'success'
      )
    } catch (err: any) {
      showToast(err.message || 'Fehler beim Herunterladen der Vorlage', 'error')
    } finally {
      setIsDownloadingTemplate(null)
    }
  }

  // Template Upload & Preview
  const handleTemplateFileSelect = async (file: File) => {
    setIsParsingUpload(true)
    setUploadPreview(null)
    try {
      const arrayBuf = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuf)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64Content = btoa(binary)

      const preview = await previewPurchasePriceUploadAction({
        fileName: file.name,
        base64Content,
      })

      setUploadPreview({
        fileName: file.name,
        ...preview,
      })
    } catch (err: any) {
      showToast(err.message || 'Fehler beim Lesen der Vorlage', 'error')
    } finally {
      setIsParsingUpload(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleApplyTemplateUpload = async () => {
    if (!uploadPreview) return
    setIsApplyingUpload(true)
    try {
      const changedItems = uploadPreview.items.filter(
        i =>
          i.priceChanged ||
          (uploadAlsoUpdateStock && i.stockChanged) ||
          (uploadAlsoUpdateStorage && i.storageLocationChanged)
      )

      const itemsToApply = (changedItems.length > 0 ? changedItems : uploadPreview.items).map(i => ({
        productId: i.productId,
        purchasePrice: i.newPurchasePrice,
        currentStock: i.newStock,
        storageLocation: i.newStorageLocation,
      }))

      const res = await applyInventoryUpdatesAction({
        items: itemsToApply,
        updatePurchasePrice: true,
        updateStock: uploadAlsoUpdateStock,
        updateStorageLocation: uploadAlsoUpdateStorage,
      })

      // Optimistically update local state immediately
      const appliedMap = new Map(itemsToApply.map(i => [i.productId, i]))
      setProducts(prev =>
        prev.map(p => {
          const upd = appliedMap.get(p.id)
          if (!upd) return p
          return {
            ...p,
            purchasePrice: upd.purchasePrice !== undefined ? upd.purchasePrice : p.purchasePrice,
            currentStock:
              uploadAlsoUpdateStock && upd.currentStock !== undefined && upd.currentStock !== null
                ? upd.currentStock
                : p.currentStock,
            storageLocation:
              uploadAlsoUpdateStorage && upd.storageLocation !== undefined
                ? upd.storageLocation
                : p.storageLocation,
          }
        })
      )

      showToast(
        `${res.updatedCount} Produkte erfolgreich aus der Vorlage aktualisiert!`,
        'success'
      )
      setUploadPreview(null)
      setShowTemplateModal(false)
      router.refresh()
    } catch (err: any) {
      showToast(err.message || 'Fehler beim Übernehmen der Vorlage', 'error')
    } finally {
      setIsApplyingUpload(false)
    }
  }

  const SortIndicator = ({ col }: { col: string }) => {
    if (sortColumn !== col) return <ChevronUp className="w-3.5 h-3.5 opacity-25" />
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-cyan-600" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-cyan-600" />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-5 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-cyan-400/10 via-emerald-400/5 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex flex-wrap items-center gap-3">
              <div className="p-2.5 bg-cyan-50 text-cyan-600 rounded-xl border border-cyan-100 shrink-0">
                <ClipboardList className="w-6 h-6" />
              </div>
              <span>Laufende Inventur</span>
              <span className="text-sm font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-full border border-slate-200 whitespace-nowrap">
                {products.length} zusammengefasste SKUs
              </span>
            </h1>
            <p className="text-slate-500 mt-1.5 font-medium text-sm">
              Echtzeit-Bestandsbewertung über alle zusammengefassten SKUs, Pflege der Einkaufspreise (manuell oder per Vorlage) sowie Export als Excel und CSV.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handleExportInventory('xlsx')}
              disabled={isExporting !== null}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-all shadow-sm disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {isExporting === 'xlsx' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              Excel Export (.xlsx)
            </button>

            <button
              type="button"
              onClick={() => handleExportInventory('csv')}
              disabled={isExporting !== null}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-all shadow-sm disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {isExporting === 'csv' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              CSV Export (.csv)
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <ProductsSubNav />

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowTemplateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-colors border border-indigo-200 shadow-xs cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              Einkaufspreis-Vorlage (Download / Upload)
            </button>

            <button
              type="button"
              onClick={() => {
                if (isQuickEditMode) {
                  setQuickEdits({})
                  setIsQuickEditMode(false)
                } else {
                  setIsQuickEditMode(true)
                }
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-xs cursor-pointer whitespace-nowrap ${
                isQuickEditMode
                  ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              {isQuickEditMode ? 'Schnellerfassung beenden' : 'Schnellerfassung (Manuell)'}
            </button>
          </div>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Inventurwert (EK Gesamt)
            </span>
            <div className="p-2 bg-cyan-50 text-cyan-600 rounded-lg">
              <Euro className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900">
              {formatCurrency(kpis.totalEkValue)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Bewertet zu hinterlegten Einkaufspreisen ({kpis.skusWithEk} von {kpis.totalSkus} SKUs)
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Gesamtbestand (Lagernd)
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900">
              {kpis.totalUnits.toLocaleString('de-DE')} Stück
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Verteilt auf {kpis.inStockSkus} lagernde SKUs ({kpis.totalSkus} SKUs gesamt)
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Verkaufswert & Rohertrag
            </span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900">
              {formatCurrency(kpis.totalVkGross)}{' '}
              <span className="text-xs font-semibold text-slate-500">Brutto</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Netto: {formatCurrency(kpis.totalVkNet)} • Rohertrag:{' '}
              <span className="font-bold text-emerald-600">
                {formatCurrency(kpis.potentialProfit)}
              </span>
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Einkaufspreis-Abdeckung
            </span>
            <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  kpis.missingEkCount === 0
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
                title={`${kpis.skusWithEk} von ${kpis.totalSkus} SKUs insgesamt gepflegt`}
              >
                {kpis.ekCoveragePercent}% Gesamt
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  kpis.inStockSkusMissingEk === 0
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-cyan-50 text-cyan-800 border border-cyan-200'
                }`}
                title={`${kpis.inStockSkusWithEk} von ${kpis.inStockSkus} lagernden SKUs (Bestand > 0) gepflegt`}
              >
                {kpis.inStockEkCoveragePercent}% mit Bestand
              </span>
            </div>
          </div>

          <div className="space-y-2 my-1">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-0.5">
                <span className="text-slate-500 font-medium">
                  Alle SKUs ({kpis.skusWithEk}/{kpis.totalSkus})
                </span>
                <span className="font-bold text-slate-800">{kpis.ekCoveragePercent}% gepflegt</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    kpis.missingEkCount === 0 ? 'bg-emerald-500' : 'bg-cyan-500'
                  }`}
                  style={{ width: `${kpis.ekCoveragePercent}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-0.5">
                <span className="text-slate-500 font-medium">
                  Mit Bestand ({kpis.inStockSkusWithEk}/{kpis.inStockSkus})
                </span>
                <span className="font-bold text-emerald-700">
                  {kpis.inStockEkCoveragePercent}% gepflegt
                </span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500 bg-emerald-500"
                  style={{ width: `${kpis.inStockEkCoveragePercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs mt-2 pt-1.5 border-t border-slate-100">
            {kpis.missingEkCount > 0 ? (
              <>
                <span className="text-amber-700 font-medium">
                  {kpis.missingEkCount} SKUs ohne EK ({kpis.inStockSkusMissingEk} lagernd)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEkFilter(prev => (prev === 'missing_ek' ? 'all' : 'missing_ek'))
                  }
                  className="font-bold text-cyan-600 hover:text-cyan-700 underline cursor-pointer shrink-0"
                >
                  {ekFilter === 'missing_ek' ? 'Alle zeigen' : 'Filtern'}
                </button>
              </>
            ) : (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Alle Einkaufspreise hinterlegt
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick-Edit Active Banner */}
      {isQuickEditMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-950">
                Manuelle Schnellerfassung aktiv
              </h3>
              <p className="text-xs text-amber-800">
                Trage Einkaufspreise, Bestände oder Lagerorte direkt in die Eingabefelder ein (Navigation mit <kbd className="px-1.5 py-0.5 bg-white rounded border border-amber-300 font-mono text-[11px]">Tab</kbd>) und speichere alle Änderungen gesammelt.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-bold text-amber-900 bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200">
              {quickEditChangedItems.length} geänderte Produkte
            </span>
            <button
              type="button"
              onClick={() => {
                setQuickEdits({})
                setIsQuickEditMode(false)
              }}
              disabled={isSavingQuickEdits}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Verwerfen
            </button>
            <button
              type="button"
              onClick={handleSaveQuickEdits}
              disabled={isSavingQuickEdits || quickEditChangedItems.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
            >
              {isSavingQuickEdits ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Alle Änderungen speichern ({quickEditChangedItems.length})
            </button>
          </div>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Nach zusammengefasster SKU, Marktplatz-SKU, Titel, EAN, Farbe, Größe oder Lagerort suchen..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-500 focus:bg-white focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={stockFilter}
              onChange={e => setStockFilter(e.target.value as any)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none cursor-pointer"
            >
              <option value="all">Bestand: Alle ({products.length})</option>
              <option value="in_stock">Nur mit Bestand &gt; 0</option>
              <option value="out_of_stock">Ohne Bestand (0)</option>
            </select>

            <select
              value={ekFilter}
              onChange={e => setEkFilter(e.target.value as any)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none cursor-pointer"
            >
              <option value="all">Einkaufspreis: Alle</option>
              <option value="with_ek">Mit Einkaufspreis</option>
              <option value="missing_ek">Ohne Einkaufspreis (fehlt)</option>
            </select>

            {availableMarketplaces.length > 0 && (
              <select
                value={marketplaceFilter}
                onChange={e => setMarketplaceFilter(e.target.value)}
                className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none cursor-pointer"
              >
                <option value="all">Marktplatz: Alle</option>
                {availableMarketplaces.map(mp => (
                  <option key={mp} value={mp}>
                    {formatMarketplaceName(mp)}
                  </option>
                ))}
              </select>
            )}

            {(searchQuery || stockFilter !== 'all' || ekFilter !== 'all' || marketplaceFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setStockFilter('all')
                  setEkFilter('all')
                  setMarketplaceFilter('all')
                }}
                className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        </div>

        {/* Selection Bulk Bar */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 animate-in fade-in">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-800 bg-cyan-50 border border-cyan-200 px-3 py-1 rounded-lg">
                {selectedIds.size} SKUs ausgewählt
              </span>
              <button
                type="button"
                onClick={() => setShowBulkEkModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-700 transition-colors shadow-xs cursor-pointer"
              >
                <Euro className="w-3.5 h-3.5" />
                Einkaufspreis für Auswahl setzen
              </button>
              <button
                type="button"
                onClick={() => handleExportInventory('xlsx', true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Auswahl als Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => handleExportInventory('csv', true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                Auswahl als CSV
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Auswahl aufheben
            </button>
          </div>
        )}
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none">
                <th className="w-12 px-4 py-3.5 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredProducts.length > 0 && selectedIds.size === filteredProducts.length
                    }
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 bg-white cursor-pointer"
                  />
                </th>
                <th
                  onClick={() => toggleSort('sku')}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Zusammengefasste SKU</span>
                    <SortIndicator col="sku" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('title')}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Produkt / Variante</span>
                    <SortIndicator col="title" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('storageLocation')}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Lagerort</span>
                    <SortIndicator col="storageLocation" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('currentStock')}
                  className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Bestand</span>
                    <SortIndicator col="currentStock" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('purchasePrice')}
                  className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Einkaufspreis (EK)</span>
                    <SortIndicator col="purchasePrice" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('ekTotal')}
                  className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100/70 transition-colors bg-cyan-50/30"
                >
                  <div className="flex items-center justify-end gap-1.5 text-cyan-900">
                    <span>Inventurwert (EK Gesamt)</span>
                    <SortIndicator col="ekTotal" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('price')}
                  className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>VK Brutto (Netto)</span>
                    <SortIndicator col="price" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('vkTotal')}
                  className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>VK-Wert (Gesamt)</span>
                    <SortIndicator col="vkTotal" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('margin')}
                  className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Marge (Netto)</span>
                    <SortIndicator col="margin" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <Package className="w-10 h-10 text-slate-300 mb-3" />
                      <p className="font-semibold text-slate-800">Keine Produkte für diesen Filter gefunden</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Passe die Suchbegriffe oder Filter oben an.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map(product => {
                  const isSelected = selectedIds.has(product.id)
                  const rowEdits = quickEdits[product.id] || {}

                  const effectiveEk =
                    isQuickEditMode && rowEdits.purchasePrice !== undefined
                      ? rowEdits.purchasePrice.trim() === ''
                        ? null
                        : Number(rowEdits.purchasePrice.replace(',', '.'))
                      : product.purchasePrice

                  const effectiveStock =
                    isQuickEditMode && rowEdits.currentStock !== undefined
                      ? Math.max(0, parseInt(rowEdits.currentStock, 10) || 0)
                      : product.currentStock

                  const validEk =
                    effectiveEk !== null && !isNaN(effectiveEk) && effectiveEk >= 0
                      ? effectiveEk
                      : null

                  const ekTotal = validEk !== null ? effectiveStock * validEk : null
                  const vkNetUnit =
                    product.taxRate > 0 ? product.price / (1 + product.taxRate) : product.price
                  const vkGrossTotal = effectiveStock * product.price
                  const marginUnit = validEk !== null ? vkNetUnit - validEk : null
                  const marginPct =
                    validEk !== null && vkNetUnit > 0 ? ((vkNetUnit - validEk) / vkNetUnit) * 100 : null

                  const additionalMappedSkus = product.mappedSkus.filter(s => s !== product.sku)

                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isSelected ? 'bg-cyan-50/30' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(product.id)}
                          className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 bg-white cursor-pointer"
                        />
                      </td>

                      {/* SKU + Consolidated SKUs */}
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/products/${product.id}`}
                            className="font-mono text-xs font-bold text-slate-800 bg-slate-100 hover:bg-cyan-50 hover:text-cyan-700 border border-slate-200 px-2.5 py-1 rounded-md transition-colors"
                          >
                            {product.sku}
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(product.sku)
                              showToast('SKU kopiert', 'info')
                            }}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded"
                            title="SKU kopieren"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                        {additionalMappedSkus.length > 0 && (
                          <div
                            className="mt-1 text-[11px] text-slate-500 flex items-center gap-1 flex-wrap"
                            title={`Zusammengefasste Marktplatz-SKUs: ${additionalMappedSkus.join(', ')}`}
                          >
                            <Layers className="w-3 h-3 text-indigo-500 shrink-0" />
                            <span className="font-mono truncate max-w-[180px]">
                              +{additionalMappedSkus.length} SKU{additionalMappedSkus.length > 1 ? 's' : ''}: {additionalMappedSkus.join(', ')}
                            </span>
                          </div>
                        )}
                        {product.marketplaces.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {product.marketplaces.map(mp => (
                              <span
                                key={mp}
                                className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200"
                              >
                                {formatMarketplaceName(mp)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Title, Variant, EAN */}
                      <td className="px-4 py-3 align-top max-w-xs">
                        <div className="font-semibold text-slate-900 line-clamp-2 leading-snug">
                          {product.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-slate-500">
                          {product.color && (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                              {product.color}
                            </span>
                          )}
                          {product.size && (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono font-bold">
                              Gr. {product.size}
                            </span>
                          )}
                          {product.ean && (
                            <span className="font-mono text-[11px] text-slate-400">
                              EAN: {product.ean}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Storage Location */}
                      <td className="px-4 py-3 align-middle">
                        {isQuickEditMode ? (
                          <input
                            type="text"
                            value={
                              rowEdits.storageLocation !== undefined
                                ? rowEdits.storageLocation
                                : product.storageLocation || ''
                            }
                            onChange={e =>
                              handleQuickEditChange(product.id, 'storageLocation', e.target.value)
                            }
                            placeholder="Lagerort..."
                            className="w-28 px-2.5 py-1 text-xs border border-slate-300 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 rounded-lg text-slate-900 placeholder:text-slate-500 bg-white outline-none"
                          />
                        ) : product.storageLocation ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {product.storageLocation}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>

                      {/* Stock */}
                      <td className="px-4 py-3 text-right align-middle">
                        {isQuickEditMode ? (
                          <input
                            type="number"
                            min="0"
                            value={
                              rowEdits.currentStock !== undefined
                                ? rowEdits.currentStock
                                : String(product.currentStock)
                            }
                            onChange={e =>
                              handleQuickEditChange(product.id, 'currentStock', e.target.value)
                            }
                            className="w-20 px-2.5 py-1 text-sm font-bold text-right border border-slate-300 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 rounded-lg text-slate-900 placeholder:text-slate-500 bg-white outline-none"
                          />
                        ) : (
                          <InlineStockCell
                            product={product}
                            onSaved={handleInlineStockSaved}
                            onToast={showToast}
                          />
                        )}
                      </td>

                      {/* Purchase Price (EK) */}
                      <td className="px-4 py-3 text-right align-middle">
                        {isQuickEditMode ? (
                          <div className="relative inline-block">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={
                                rowEdits.purchasePrice !== undefined
                                  ? rowEdits.purchasePrice
                                  : product.purchasePrice !== null
                                  ? product.purchasePrice.toFixed(2).replace('.', ',')
                                  : ''
                              }
                              onChange={e =>
                                handleQuickEditChange(product.id, 'purchasePrice', e.target.value)
                              }
                              placeholder="0,00"
                              className={`w-28 px-2.5 py-1 pr-6 text-sm font-semibold text-right border rounded-lg text-slate-900 placeholder:text-slate-500 outline-none transition-colors ${
                                rowEdits.purchasePrice !== undefined
                                  ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-500/20'
                                  : 'border-slate-300 bg-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
                              }`}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                              €
                            </span>
                          </div>
                        ) : (
                          <InlinePurchasePriceCell
                            product={product}
                            onSaved={handleInlinePriceSaved}
                            onToast={showToast}
                          />
                        )}
                      </td>

                      {/* Total Inventory Value (EK * Stock) */}
                      <td className="px-4 py-3 text-right align-middle bg-cyan-50/20 font-bold text-slate-900">
                        {ekTotal !== null ? (
                          <span>{formatCurrency(ekTotal)}</span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600 italic">
                            EK fehlt
                          </span>
                        )}
                      </td>

                      {/* VK Brutto / Netto */}
                      <td className="px-4 py-3 text-right align-middle">
                        <div className="font-semibold text-slate-800">
                          {formatCurrency(product.price)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Netto: {formatCurrency(vkNetUnit)} ({Math.round(product.taxRate * 100)}%)
                        </div>
                      </td>

                      {/* Total VK Gross Value */}
                      <td className="px-4 py-3 text-right align-middle font-semibold text-slate-700">
                        {formatCurrency(vkGrossTotal)}
                      </td>

                      {/* Margin */}
                      <td className="px-4 py-3 text-right align-middle">
                        {marginUnit !== null && marginPct !== null ? (
                          <div>
                            <span
                              className={`inline-block text-xs font-bold px-2 py-0.5 rounded-md ${
                                marginUnit >= 0
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {marginPct.toFixed(1).replace('.', ',')}%
                            </span>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {formatCurrency(marginUnit)} / Stk.
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>

            {/* Summary Footer */}
            {filteredProducts.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 text-white font-bold text-sm">
                  <td colSpan={4} className="px-4 py-4">
                    GESAMT / SUMME ({filteredProducts.length} zusammengefasste SKUs)
                  </td>
                  <td className="px-4 py-4 text-right">
                    {kpis.totalUnits.toLocaleString('de-DE')} Stk.
                  </td>
                  <td className="px-4 py-4 text-right text-slate-300 text-xs font-normal">
                    ({kpis.skusWithEk} mit EK)
                  </td>
                  <td className="px-4 py-4 text-right text-cyan-300 text-base">
                    {formatCurrency(kpis.totalEkValue)}
                  </td>
                  <td className="px-4 py-4 text-right text-slate-300 text-xs font-normal">
                    Netto-VK: {formatCurrency(kpis.totalVkNet)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {formatCurrency(kpis.totalVkGross)}
                  </td>
                  <td className="px-4 py-4 text-right text-emerald-300">
                    +{formatCurrency(kpis.potentialProfit)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal 1: Einkaufspreis-Vorlage (Herunterladen & Hochladen) */}
      {showTemplateModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => {
            if (!isApplyingUpload) setShowTemplateModal(false)
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">
                    Einkaufspreis-Vorlage (Download & Upload)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Vorlage mit deinen aktuellen zusammengefassten SKUs herunterladen, Einkaufspreise eintragen und wieder hochladen.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Step 1: Download Template */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-full mb-1.5">
                      Schritt 1
                    </span>
                    <h3 className="text-base font-bold text-slate-900">
                      Vorlage mit aktuellen (zusammengefassten) SKUs herunterladen
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">
                      Die Datei enthält alle zusammengefassten Haupt-SKUs, zugehörige Marktplatz-SKUs, Titel, Farbe, Größe, Bestand, Verkaufspreis und eine Spalte <strong>„Einkaufspreis“</strong> zum Ausfüllen.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                      Umfang:
                    </label>
                    <select
                      value={templateFilter}
                      onChange={e => setTemplateFilter(e.target.value as any)}
                      className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none"
                    >
                      <option value="all">
                        Alle zusammengefassten SKUs ({products.length})
                      </option>
                      <option value="in_stock_missing_ek">
                        Nur lagernde SKUs ohne Einkaufspreis (
                        {
                          products.filter(
                            p => p.currentStock > 0 && (!p.purchasePrice || p.purchasePrice <= 0)
                          ).length
                        }
                        )
                      </option>
                      <option value="missing_ek">
                        Alle SKUs ohne Einkaufspreis (
                        {products.filter(p => !p.purchasePrice || p.purchasePrice <= 0).length})
                      </option>
                      <option value="in_stock">
                        Nur lagernde SKUs mit Bestand &gt; 0 (
                        {products.filter(p => p.currentStock > 0).length})
                      </option>
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate('xlsx')}
                      disabled={isDownloadingTemplate !== null}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {isDownloadingTemplate === 'xlsx' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      Vorlage als Excel (.xlsx)
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate('csv')}
                      disabled={isDownloadingTemplate !== null}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-800 border border-slate-300 text-xs font-bold hover:bg-slate-100 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {isDownloadingTemplate === 'csv' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      Vorlage als CSV (.csv)
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 2: Upload Filled Template */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div>
                  <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-cyan-700 bg-cyan-100 px-2.5 py-0.5 rounded-full mb-1.5">
                    Schritt 2
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    Ausgefüllte Vorlage wieder hochladen (.xlsx oder .csv)
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Lade deine bearbeitete Excel- oder CSV-Vorlage hoch. Das System ordnet die Preise automatisch anhand der SKU (oder Marktplatz-SKU) zu.
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleTemplateFileSelect(file)
                  }}
                  className="hidden"
                />

                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    const file = e.dataTransfer.files?.[0]
                    if (file) handleTemplateFileSelect(file)
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-indigo-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/30 rounded-2xl p-6 text-center cursor-pointer transition-all"
                >
                  {isParsingUpload ? (
                    <div className="flex flex-col items-center justify-center py-2">
                      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
                      <p className="text-sm font-bold text-slate-800">
                        Datei wird analysiert...
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-bold text-slate-900">
                        Klicken zum Auswählen oder Datei hierher ziehen
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Unterstützt Excel (<strong>.xlsx</strong>) und CSV (<strong>.csv</strong>)
                      </p>
                    </div>
                  )}
                </div>

                {/* Upload Preview */}
                {uploadPreview && (
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 animate-in fade-in">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div>
                        <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Datei geladen: {uploadPreview.fileName}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {uploadPreview.matchedCount} passende SKUs erkannt •{' '}
                          <strong className="text-indigo-700">
                            {uploadPreview.changedPriceCount} neue/geänderte Einkaufspreise
                          </strong>{' '}
                          ({uploadPreview.withValidPriceCount} Preise insgesamt in Datei)
                        </p>
                      </div>
                    </div>

                    {/* Optional checkboxes if stock or storage location also changed in the file */}
                    {(uploadPreview.changedStockCount > 0 ||
                      uploadPreview.items.some(i => i.storageLocationChanged)) && (
                      <div className="flex flex-wrap gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                        {uploadPreview.changedStockCount > 0 && (
                          <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={uploadAlsoUpdateStock}
                              onChange={e => setUploadAlsoUpdateStock(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                            />
                            <span>
                              Auch geänderte Bestände übernehmen ({uploadPreview.changedStockCount} SKUs)
                            </span>
                          </label>
                        )}
                        {uploadPreview.items.some(i => i.storageLocationChanged) && (
                          <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={uploadAlsoUpdateStorage}
                              onChange={e => setUploadAlsoUpdateStorage(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 bg-white"
                            />
                            <span>Auch geänderte Lagerorte übernehmen</span>
                          </label>
                        )}
                      </div>
                    )}

                    {/* Preview Table of recognized changes */}
                    {uploadPreview.items.length > 0 && (
                      <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-500 uppercase">
                            <tr>
                              <th className="px-3 py-2">SKU</th>
                              <th className="px-3 py-2">Titel</th>
                              <th className="px-3 py-2 text-right">Bisheriger EK</th>
                              <th className="px-3 py-2 text-right">Neuer EK</th>
                              <th className="px-3 py-2 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {uploadPreview.items.slice(0, 100).map(item => (
                              <tr key={item.productId} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-mono font-bold text-slate-800">
                                  {item.sku}
                                  {item.matchedVia === 'mapped_sku' && (
                                    <span className="block text-[10px] text-indigo-600 font-normal">
                                      (via {item.uploadedSku})
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-slate-700 truncate max-w-[200px]">
                                  {item.title}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-500">
                                  {formatCurrency(item.oldPurchasePrice)}
                                </td>
                                <td className="px-3 py-2 text-right font-bold text-slate-900">
                                  {formatCurrency(item.newPurchasePrice)}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {item.priceChanged ? (
                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold text-[10px] border border-emerald-200">
                                      Wird aktualisiert
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-[10px]">Unverändert</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {uploadPreview.notFoundSkus.length > 0 && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                        <strong>Hinweis:</strong> {uploadPreview.notFoundSkus.length} SKU(s) aus der Datei wurden nicht im System gefunden:{' '}
                        <span className="font-mono">
                          {uploadPreview.notFoundSkus.slice(0, 10).join(', ')}
                          {uploadPreview.notFoundSkus.length > 10 ? ' ...' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowTemplateModal(false)
                  setUploadPreview(null)
                }}
                disabled={isApplyingUpload}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Schließen
              </button>
              {uploadPreview && (
                <button
                  type="button"
                  onClick={handleApplyTemplateUpload}
                  disabled={isApplyingUpload || uploadPreview.matchedCount === 0}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
                >
                  {isApplyingUpload ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Einkaufspreise jetzt speichern
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Bulk Purchase Price Modal */}
      {showBulkEkModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowBulkEkModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-50 text-cyan-600 rounded-xl">
                  <Euro className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Einkaufspreis für {selectedIds.size} SKUs setzen
                  </h3>
                  <p className="text-xs text-slate-500">
                    Gilt für alle aktuell ausgewählten Produkte.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkEkModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Einkaufspreis (in €)
                </label>
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={bulkEkValue}
                  onChange={e => setBulkEkValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleBulkEkSubmit()
                  }}
                  placeholder="z.B. 12,50 (leer lassen zum Löschen)"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-500 font-semibold focus:bg-white focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBulkEkModal(false)}
                  disabled={isSavingBulkEk}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleBulkEkSubmit}
                  disabled={isSavingBulkEk}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isSavingBulkEk && <Loader2 className="w-4 h-4 animate-spin" />}
                  Speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 z-50 animate-in slide-in-from-bottom-4 ${
            toast.type === 'error'
              ? 'bg-rose-600 text-white'
              : toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-900 text-white'
          }`}
        >
          <span className="text-sm font-semibold">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-white/70 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

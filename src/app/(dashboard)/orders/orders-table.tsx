'use client'

import { useState, Fragment } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { generateHermesLabelsAction, generateDhlLabelsAction } from '@/app/actions/shipping'
import { archiveOrderAction, archiveOrdersBulkAction, updateOrderStatusAction, updateOrderAddressAction, generateOrDownloadInvoicesBulkAction } from '@/app/actions/orders'
import { getInvoiceDownloadUrl } from '@/app/actions/invoices'
import type { Order, OrderItem } from '@/db/schema/orders'
import type { Invoice } from '@/db/schema/invoices'
import type { DhlConfig } from '@/app/(dashboard)/integrations/dhl-form'

export type OrderWithItems = Order & { items: OrderItem[], invoice?: Invoice | null }

const formatCountry = (code?: string | null) => {
  if (!code) return 'DE'
  const map: Record<string, string> = {
    'DEU': 'DE', 'AUT': 'AT', 'CHE': 'CH', 'FRA': 'FR',
    'ITA': 'IT', 'ESP': 'ES', 'NLD': 'NL', 'BEL': 'BE',
    'POL': 'PL', 'DNK': 'DK', 'SWE': 'SE', 'NOR': 'NO',
    'FIN': 'FI', 'GBR': 'GB'
  }
  return map[code.toUpperCase()] || code.toUpperCase()
}

const getDefaultDhlProductCode = (country: string | null | undefined, config: DhlConfig | null | undefined): string => {
  if (!country) return 'V01PAK'
  const c = country.toUpperCase()
  const isDomestic = ['DE', 'DEU'].includes(c)
  if (isDomestic) return 'V01PAK'

  const connectCountries = ['BE', 'BEL', 'LU', 'LUX', 'NL', 'NLD', 'AT', 'AUT', 'PL', 'POL', 'SK', 'SVK', 'CZ', 'CZE']
  const isConnect = connectCountries.includes(c)

  // Check which zones actually have billing numbers configured
  const hasZone = (prodCode: string) => {
    return !!config?.zones?.find(z => z.productCode === prodCode && z.billingNumber?.trim())
  }

  if (isConnect) {
    if (hasZone('V55PAK')) return 'V55PAK' // DHL Paket Connect
    if (hasZone('V53WPAK')) return 'V53WPAK' // DHL Europaket
    if (hasZone('V06PAK')) return 'V06PAK' // DHL Paket International
  } else {
    const europeanCountries = [
      'FR', 'FRA', 'IT', 'ITA', 'ES', 'ESP', 'DK', 'DNK', 'SE', 'SWE', 'FI', 'FIN', 'EE', 'EST', 'LV', 'LVA', 'LT', 'LTU',
      'IE', 'IRL', 'PT', 'PRT', 'GR', 'GRC', 'BG', 'BGR', 'RO', 'ROU', 'HU', 'HUN', 'HR', 'HRV', 'SI', 'SVN',
      'CH', 'CHE', 'GB', 'GBR', 'NO', 'NOR'
    ]
    const isEurope = europeanCountries.includes(c)
    if (isEurope) {
      if (hasZone('V53WPAK')) return 'V53WPAK' // DHL Europaket
      if (hasZone('V06PAK')) return 'V06PAK' // DHL Paket International
    }
  }

  // Fallback / default international
  if (hasZone('V06PAK')) return 'V06PAK'
  if (hasZone('V53WPAK')) return 'V53WPAK'
  if (hasZone('V55PAK')) return 'V55PAK'
  
  return 'V06PAK' // Default international if nothing is configured
}

const formatMarketplaceName = (mp: string) => {
  if (!mp) return 'N/A'
  if (mp === 'mirakl_decathlon') return 'Decathlon'
  if (mp === 'mirakl_decathlon_eu') return 'MIRAKL Hauptaccount'
  if (mp === 'mirakl_mediamarkt') return 'MediaMarkt'
  if (mp === 'otto') return 'Otto'
  if (mp === 'shopify') return 'Shopify'
  if (mp === 'aboutyou') return 'About You'
  if (mp === 'amazon') return 'Amazon'
  if (mp === 'kaufland') return 'Kaufland'
  if (mp === 'ebay') return 'eBay'
  // Capitalize first letter for others
  return mp.charAt(0).toUpperCase() + mp.slice(1)
}

const getMarketplaceBadgeStyle = (mp: string) => {
  switch (mp) {
    case 'otto':
      return { backgroundColor: '#ffebee', color: '#c62828' }
    case 'aboutyou':
      return { backgroundColor: '#f3e5f5', color: '#6a1b9a' }
    case 'shopify':
      return { backgroundColor: '#e8f5e9', color: '#2e7d32' }
    case 'mirakl_decathlon':
    case 'mirakl_decathlon_eu':
    case 'mirakl_mediamarkt':
      return { backgroundColor: '#e3f2fd', color: '#0d47a1' }
    case 'amazon':
      return { backgroundColor: '#fff3e0', color: '#e65100' }
    case 'kaufland':
      return { backgroundColor: '#fce8e6', color: '#c5221f' }
    case 'ebay':
      return { backgroundColor: '#e8f0fe', color: '#1967d2' }
    default:
      // Custom Mirakl integration style (nice clean green)
      return { backgroundColor: '#e8f5e9', color: '#1b5e20' }
  }
}

export function OrdersTable({ 
  orders, 
  hermesDefaultParcelClass = 'XS',
  customMiraklIntegrations = [],
  dhlConfig = null,
  hasKauflandIntegration = false,
  hasEbayIntegration = false,
  hasAboutYouIntegration = false,
}: { 
  orders: OrderWithItems[]
  hermesDefaultParcelClass?: string
  customMiraklIntegrations?: any[]
  dhlConfig?: DhlConfig | null
  hasKauflandIntegration?: boolean
  hasEbayIntegration?: boolean
  hasAboutYouIntegration?: boolean
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDeletingBulk, setIsDeletingBulk] = useState(false)
  const [isDhlGenerating, setIsDhlGenerating] = useState(false)
  const [isGeneratingInvoices, setIsGeneratingInvoices] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null)
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null)
  const [showHermesModal, setShowHermesModal] = useState(false)
  const [hermesSelections, setHermesSelections] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  
  const [showDhlModal, setShowDhlModal] = useState(false)
  const [dhlSelections, setDhlSelections] = useState<Record<string, { productCode: string; weight: number }>>({})
  
  // Address editing states
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editStreet, setEditStreet] = useState('')
  const [editZip, setEditZip] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editCountry, setEditCountry] = useState('')
  const [isUpdatingAddress, setIsUpdatingAddress] = useState(false)
  
  const showToast = (message: string | undefined | null, type: 'success' | 'error' | 'info' = 'info') => {
    if (!message) return
    setToast({ message, type })
    // Only auto-dismiss success and info toasts. Error toasts must be explicitly closed by the user.
    if (type !== 'error') {
      setTimeout(() => {
        setToast(current => current?.message === message ? null : current)
      }, 5000)
    }
  }

  const startEditingAddress = (order: OrderWithItems) => {
    setEditingAddressId(order.id)
    setEditName(order.shippingName || '')
    setEditStreet(order.shippingStreet || '')
    setEditZip(order.shippingZip || '')
    setEditCity(order.shippingCity || '')
    setEditCountry(order.shippingCountry || 'DE')
  }

  const handleSaveAddress = async (orderId: string) => {
    setIsUpdatingAddress(true)
    try {
      const result = await updateOrderAddressAction(orderId, {
        shippingName: editName,
        shippingStreet: editStreet,
        shippingZip: editZip,
        shippingCity: editCity,
        shippingCountry: editCountry,
      })
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast(result.message, 'success')
        setEditingAddressId(null)
      }
    } catch (e) {
      showToast('Fehler beim Aktualisieren der Lieferadresse.', 'error')
    } finally {
      setIsUpdatingAddress(false)
    }
  }
  
  // Applied Filters (The actual state used for filtering)
  const [activeFilters, setActiveFilters] = useState({
    search: '',
    marketplace: 'all',
    status: 'all',
    country: 'all',
    fromDate: '',
    toDate: '',
  })

  // Draft Filters (The state while typing/selecting)
  const [draftSearch, setDraftSearch] = useState('')
  const [draftMarketplace, setDraftMarketplace] = useState('all')
  const [draftStatus, setDraftStatus] = useState('all')
  const [draftCountry, setDraftCountry] = useState('all')
  const [draftFromDate, setDraftFromDate] = useState('')
  const [draftToDate, setDraftToDate] = useState('')

  // Pagination
  const [pageSize, setPageSize] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)

  const handleApplyFilters = () => {
    setActiveFilters({
      search: draftSearch,
      marketplace: draftMarketplace,
      status: draftStatus,
      country: draftCountry,
      fromDate: draftFromDate,
      toDate: draftToDate,
    })
    setCurrentPage(1)
  }

  const handleResetFilters = () => {
    setDraftSearch('')
    setDraftMarketplace('all')
    setDraftStatus('all')
    setDraftCountry('all')
    setDraftFromDate('')
    setDraftToDate('')
    setActiveFilters({
      search: '',
      marketplace: 'all',
      status: 'all',
      country: 'all',
      fromDate: '',
      toDate: '',
    })
    setCurrentPage(1)
  }

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    setIsUpdatingStatus(orderId)
    try {
      const result = await updateOrderStatusAction(orderId, newStatus)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast('Status erfolgreich aktualisiert.', 'success')
      }
    } catch (e) {
      showToast('Fehler beim Aktualisieren des Status.', 'error')
    } finally {
      setIsUpdatingStatus(null)
    }
  }
  const filteredOrders = orders.filter(order => {
    // Filter by Marketplace
    if (activeFilters.marketplace !== 'all' && order.marketplace !== activeFilters.marketplace) {
      return false
    }
    // Filter by Status
    if (activeFilters.status !== 'all' && order.status !== activeFilters.status) {
      return false
    }
    // Filter by Date Range
    if (activeFilters.fromDate || activeFilters.toDate) {
      const orderDate = order.marketplacePurchaseDate ? new Date(order.marketplacePurchaseDate) : null
      if (!orderDate) return false
      
      if (activeFilters.fromDate) {
        const start = new Date(activeFilters.fromDate)
        start.setHours(0, 0, 0, 0)
        if (orderDate < start) return false
      }
      if (activeFilters.toDate) {
        const end = new Date(activeFilters.toDate)
        end.setHours(23, 59, 59, 999)
        if (orderDate > end) return false
      }
    }
    // Filter by Country
    if (activeFilters.country !== 'all') {
      const raw = (order.shippingCountry || '').toUpperCase()
      const iso3to2: Record<string, string> = {
        DEU: 'DE', AUT: 'AT', CHE: 'CH', FRA: 'FR', NLD: 'NL',
        BEL: 'BE', POL: 'PL', CZE: 'CZ', SVK: 'SK', LUX: 'LU',
        ITA: 'IT', ESP: 'ES', GBR: 'GB', USA: 'US', CHN: 'CN',
      }
      const code = raw.length === 3 ? (iso3to2[raw] ?? raw.slice(0, 2)) : raw
      if (code !== activeFilters.country) {
        return false
      }
    }

    // Filter by Search (Order ID, Customer Name)
    if (activeFilters.search.trim() !== '') {
      const q = activeFilters.search.toLowerCase()
      // @ts-ignore
      const orderNumber = String(order.rawPayload?.orderNumber || order.marketplaceOrderId).toLowerCase()
      // @ts-ignore
      const buyerName = String(order.buyerName || order.buyer?.name || '').toLowerCase()
      if (!orderNumber.includes(q) && !buyerName.includes(q)) {
        return false
      }
    }
    return true
  })

  // Get unique countries for filter
  const uniqueCountries = Array.from(new Set(orders.map(o => {
    const raw = (o.shippingCountry || '').toUpperCase()
    const iso3to2: Record<string, string> = {
      DEU: 'DE', AUT: 'AT', CHE: 'CH', FRA: 'FR', NLD: 'NL',
      BEL: 'BE', POL: 'PL', CZE: 'CZ', SVK: 'SK', LUX: 'LU',
      ITA: 'IT', ESP: 'ES', GBR: 'GB', USA: 'US', CHN: 'CN',
    }
    return raw.length === 3 ? (iso3to2[raw] ?? raw.slice(0, 2)) : raw
  }))).filter(Boolean).sort()

  // Pagination Logic
  const totalPages = Math.ceil(filteredOrders.length / pageSize)
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // Reset to page 1 when filters change
  const handleFilterChange = (setter: (val: any) => void, value: any) => {
    setter(value)
    setCurrentPage(1)
  }

  const toggleAll = () => {
    const pageIds = paginatedOrders.map(o => o.id)
    const areAllOnPageSelected = paginatedOrders.length > 0 && paginatedOrders.every(o => selectedIds.has(o.id))
    
    setSelectedIds(prev => {
      if (areAllOnPageSelected) {
        // Clear all selections across all pages when unchecking
        return new Set()
      } else {
        const next = new Set(prev)
        pageIds.forEach(id => next.add(id))
        return next
      }
    })
  }

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpandedIds(next)
  }

  // Helper: open a label — handles http URLs, data URIs, and raw base64 PDFs


  const openLabel = (url: string) => {
    if (!url) return

    let base64: string | null = null

    if (url.startsWith('data:application/pdf;base64,')) {
      // Already a proper data URI
      base64 = url.split(',')[1]
    } else if (!url.startsWith('http')) {
      // Raw base64 string (e.g. from DHL Sandbox returning label.b64)
      base64 = url
    }

    if (base64) {
      try {
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], { type: 'application/pdf' })
        const blobUrl = URL.createObjectURL(blob)
        window.open(blobUrl, '_blank')
      } catch (e) {
        showToast('Das Label konnte nicht geöffnet werden. Bitte versuche es erneut.', 'error')
        console.error('[openLabel] base64 decode error:', e)
      }
    } else {
      window.open(url, '_blank')
    }
  }

  const handleOpenInvoice = async (invoiceId: string) => {
    try {
      setLoadingInvoiceId(invoiceId)
      const url = await getInvoiceDownloadUrl(invoiceId)
      window.open(url, '_blank')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Fehler beim Laden der Rechnung.', 'error')
    } finally {
      setLoadingInvoiceId(null)
    }
  }

  const getBillingAddress = (order: Order) => {
    const raw = order.rawPayload as any
    if (!raw) return null

    // 1. Otto Structure
    if (raw.invoiceAddress) {
      return {
        street: `${raw.invoiceAddress.street || ''} ${raw.invoiceAddress.houseNumber || ''}`.trim(),
        zip: raw.invoiceAddress.zipCode || '',
        city: raw.invoiceAddress.city || '',
        country: raw.invoiceAddress.countryCode || ''
      }
    }

    // 2. Mirakl Structure
    if (raw.customer?.billing_address) {
      const addr = raw.customer.billing_address
      return {
        street: `${addr.street_1 || ''} ${addr.street_2 || ''}`.trim(),
        zip: addr.zip_code || '',
        city: addr.city || '',
        country: addr.country_iso_code || addr.country || ''
      }
    }

    // 3. About You Structure
    if (raw.billing_street) {
      return {
        street: raw.billing_street || '',
        zip: raw.billing_zip_code || '',
        city: raw.billing_city || '',
        country: raw.billing_country_code || ''
      }
    }

    return null
  }

  const handleGenerateLabels = async () => {
    const unshippedIds = Array.from(selectedIds).filter(id => orders.find(o => o.id === id)?.status !== 'shipped')
    if (unshippedIds.length === 0) return
    
    // Initialize with the configured default parcel class
    const initialSelections: Record<string, string> = {}
    unshippedIds.forEach(id => {
      initialSelections[id] = hermesDefaultParcelClass
    })
    setHermesSelections(initialSelections)
    setShowHermesModal(true)
  }

  const confirmGenerateHermesLabels = async () => {
    setShowHermesModal(false)
    setIsGenerating(true)
    try {
      const ids = Array.from(selectedIds).filter(id => orders.find(o => o.id === id)?.status !== 'shipped')
      const result = await generateHermesLabelsAction(ids, hermesSelections)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        if (result.warning) {
          showToast(result.warning, 'error')
        } else {
          showToast(result.message, 'success')
        }
        
        if (result.labels && result.labels.length > 0) {
          window.open(`/api/orders/bulk/shipping-labels?ids=${ids.join(',')}`, '_blank')
        }
      }
    } catch (e) {
      showToast('Fehler: ' + (e instanceof Error ? e.message : String(e)), 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateDhlLabels = async () => {
    if (!dhlConfig) {
      showToast('DHL ist nicht konfiguriert. Bitte richte die DHL-Verbindung unter Integrationen ein.', 'error')
      return
    }

    const unshippedIds = Array.from(selectedIds).filter(id => orders.find(o => o.id === id)?.status !== 'shipped')
    if (unshippedIds.length === 0) return

    // Initialize selections for each order
    const initialSelections: Record<string, { productCode: string; weight: number }> = {}
    unshippedIds.forEach(id => {
      const order = orders.find(o => o.id === id)
      if (!order) return

      // Determine if destination is domestic (Germany)
      const isDomestic = !order.shippingCountry || ['DE', 'DEU'].includes(order.shippingCountry.toUpperCase())
      
      // Default dynamically based on country and user's DHL configurations
      let productCode = getDefaultDhlProductCode(order.shippingCountry, dhlConfig)
      let weight = dhlConfig.defaultWeight ?? 1

      if (order.totalWeight && Number(order.totalWeight) > 0) {
        weight = Number(order.totalWeight)
      } else {
        // Fallback to configured default weight for that product type
        if (productCode === 'V62WP') {
          weight = dhlConfig.defaultWeightWarenpost ?? 0.2
        } else if (productCode === 'V66WPI') {
          weight = dhlConfig.defaultWeightWarenpostInternational ?? 0.2
        } else if (productCode === 'V86PARCEL') {
          weight = dhlConfig.defaultWeightKleinpaket ?? 0.5
        } else if (productCode === 'V87PARCEL') {
          weight = dhlConfig.defaultWeightKleinpaketInternational ?? 0.5
        }
      }

      initialSelections[id] = { productCode, weight }
    })

    setDhlSelections(initialSelections)
    setShowDhlModal(true)
  }

  const confirmGenerateDhlLabels = async () => {
    setShowDhlModal(false)
    setIsDhlGenerating(true)
    try {
      const ids = Array.from(selectedIds).filter(id => orders.find(o => o.id === id)?.status !== 'shipped')
      const result = await generateDhlLabelsAction(ids, dhlSelections)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        if (result.warning) {
          showToast(result.warning, 'error')
        } else {
          showToast(result.message, 'success')
        }
        if (result.labels && result.labels.length > 0) {
          window.open(`/api/orders/bulk/shipping-labels?ids=${ids.join(',')}`, '_blank')
        }
      }
    } catch (e) {
      showToast('Fehler: ' + (e instanceof Error ? e.message : String(e)), 'error')
    } finally {
      setIsDhlGenerating(false)
    }
  }

  const handleDhlProductChange = (orderId: string, newProductCode: string) => {
    setDhlSelections(prev => {
      const current = prev[orderId]
      if (!current) return prev

      // Determine default weight for the new product code
      let defaultW = dhlConfig?.defaultWeight ?? 1
      if (newProductCode === 'V62WP') {
        defaultW = dhlConfig?.defaultWeightWarenpost ?? 0.2
      } else if (newProductCode === 'V66WPI') {
        defaultW = dhlConfig?.defaultWeightWarenpostInternational ?? 0.2
      } else if (newProductCode === 'V86PARCEL') {
        defaultW = dhlConfig?.defaultWeightKleinpaket ?? 0.5
      } else if (newProductCode === 'V87PARCEL') {
        defaultW = dhlConfig?.defaultWeightKleinpaketInternational ?? 0.5
      }

      return {
        ...prev,
        [orderId]: {
          productCode: newProductCode,
          weight: defaultW
        }
      }
    })
  }

  const handleDhlWeightChange = (orderId: string, newWeight: number) => {
    setDhlSelections(prev => {
      const current = prev[orderId]
      if (!current) return prev
      return {
        ...prev,
        [orderId]: {
          ...current,
          weight: newWeight
        }
      }
    })
  }

  const handleDelete = async (orderId: string) => {
    if (!confirm('Möchtest du diese Bestellung wirklich löschen?')) return
    
    try {
      const result = await archiveOrderAction(orderId)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast(result.message, 'success')
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.delete(orderId)
          return next
        })
      }
    } catch (e) {
      showToast('Fehler beim Löschen.', 'error')
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Möchtest du wirklich ${selectedIds.size} Bestellungen löschen?`)) return
    
    setIsDeletingBulk(true)
    try {
      const result = await archiveOrdersBulkAction(Array.from(selectedIds))
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast(result.message, 'success')
        setSelectedIds(new Set())
      }
    } catch (e) {
      showToast('Fehler: ' + (e instanceof Error ? e.message : String(e)), 'error')
    } finally {
      setIsDeletingBulk(false)
    }
  }

  const handleBulkDeliveryNotes = () => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds).join(',')
    window.open(`/api/orders/bulk/delivery-note?ids=${ids}`, '_blank')
  }

  const handleBulkInvoices = () => {
    const ids = Array.from(selectedIds)
      .filter(id => !!orders.find(o => o.id === id)?.invoiceId)

    if (ids.length === 0) {
      showToast('Keine Rechnungen für die ausgewählten Bestellungen gefunden.', 'error')
      return
    }
    window.open(`/api/orders/bulk/invoices?ids=${ids.join(',')}`, '_blank')
  }

  // Collect stored label URLs from already-processed orders and open them merged
  const handleReprintLabels = () => {
    const ids = Array.from(selectedIds)
      .filter(id => !!orders.find(o => o.id === id)?.labelUrl)

    if (ids.length === 0) {
      showToast('Keine gespeicherten Versandlabels für die ausgewählten Bestellungen gefunden.', 'error')
      return
    }
    window.open(`/api/orders/bulk/shipping-labels?ids=${ids.join(',')}`, '_blank')
  }

  const handleBulkGenerateInvoices = async () => {
    const ids = Array.from(selectedIds).filter(id => !orders.find(o => o.id === id)?.invoiceId)
    if (ids.length === 0) return

    setIsGeneratingInvoices(true)
    try {
      const result = await generateOrDownloadInvoicesBulkAction(ids)
      if (result.error) {
        showToast(result.error, 'error')
      } else {
        showToast(result.message, 'success')
        setSelectedIds(prev => {
          const next = new Set(prev)
          ids.forEach(id => next.delete(id))
          return next
        })
      }
    } catch (e) {
      showToast('Fehler beim Erstellen der Rechnungen: ' + (e instanceof Error ? e.message : String(e)), 'error')
    } finally {
      setIsGeneratingInvoices(false)
    }
  }

  // Count selected orders that have a stored label
  const selectedWithLabel = Array.from(selectedIds)
    .filter(id => orders.find(o => o.id === id)?.labelUrl).length

  // Count selected orders that have an invoice
  const selectedWithInvoice = Array.from(selectedIds)
    .filter(id => !!orders.find(o => o.id === id)?.invoiceId).length

  // Count selected orders that are not shipped
  const selectedUnshippedCount = Array.from(selectedIds)
    .filter(id => orders.find(o => o.id === id)?.status !== 'shipped').length

  // Count selected orders that do not have an invoice yet
  const selectedWithoutInvoice = Array.from(selectedIds)
    .filter(id => !orders.find(o => o.id === id)?.invoiceId).length

  return (
    <div className="relative">
      <div>
      <div className="mb-4 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
        <p className="text-sm text-gray-500">
          {selectedIds.size} von {filteredOrders.length} Bestellungen ausgewählt
        </p>
        
        <div className="flex flex-wrap gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDeliveryNotes}
              className="flex items-center gap-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 font-semibold py-2 px-4 rounded-md transition-colors text-sm shadow-sm"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Lieferscheine ({selectedIds.size})
            </button>
          )}

          {selectedWithInvoice > 0 && (
            <button
              onClick={handleBulkInvoices}
              className="flex items-center gap-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 font-semibold py-2 px-4 rounded-md transition-colors text-sm shadow-sm"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Rechnungen ({selectedWithInvoice})
            </button>
          )}

          {selectedWithoutInvoice > 0 && (
            <button
              onClick={handleBulkGenerateInvoices}
              disabled={isGeneratingInvoices || isDeletingBulk || isGenerating || isDhlGenerating}
              className="flex items-center gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-sm"
            >
              {isGeneratingInvoices ? (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              Rechnungen erstellen/abrufen ({selectedWithoutInvoice})
            </button>
          )}

          {/* Reprint stored labels button – only visible when selected orders have saved labels */}
          {selectedWithLabel > 0 && (
            <button
              onClick={handleReprintLabels}
              className="flex items-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-semibold py-2 px-4 rounded-md transition-colors text-sm shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Labels drucken ({selectedWithLabel})
            </button>
          )}

          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={isDeletingBulk || isGenerating}
              className="flex items-center gap-2 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isDeletingBulk ? (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
              Löschen ({selectedIds.size})
            </button>
          )}

          {/* DHL Labels Button */}
          <button
            onClick={handleGenerateDhlLabels}
            disabled={selectedUnshippedCount === 0 || isDhlGenerating || isDeletingBulk || isGenerating}
            className="flex items-center gap-2 bg-yellow-400 text-gray-900 hover:bg-yellow-500 font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-sm"
          >
            {isDhlGenerating ? (
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
            ) : (
              <span className="font-black text-xs tracking-tighter">DHL</span>
            )}
            {selectedIds.size > 0 ? `Labels generieren (${selectedUnshippedCount})` : 'DHL Labels'}
          </button>

          {/* Hermes Labels Button */}
          <button
            onClick={handleGenerateLabels}
            disabled={selectedUnshippedCount === 0 || isGenerating || isDeletingBulk || isDhlGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 font-medium hover:bg-blue-100 transition-all disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            {selectedIds.size > 0 ? `Hermes Labels generieren (${selectedUnshippedCount})` : 'Hermes Labels generieren'}
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="mb-6 bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col gap-5">
        {/* Row 1: Search */}
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex-1 w-full">
            <label htmlFor="search" className="sr-only">Suche</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                id="search"
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                placeholder="Nach Bestellnummer oder Kunde suchen..."
                className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 font-medium placeholder-gray-500 bg-gray-50/30 transition-all"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2 px-3 text-sm text-gray-500">
            {filteredOrders.length} {filteredOrders.length === 1 ? 'Bestellung' : 'Bestellungen'}
          </div>
        </div>

        {/* Row 2: Selects & Dates & Apply */}
        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-100">
          <select
            value={draftMarketplace}
            onChange={(e) => setDraftMarketplace(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[150px] text-gray-900 font-medium text-sm"
          >
            <option value="all">Alle Marktplätze</option>
            <option value="otto">Otto</option>
            <option value="mirakl_decathlon">Decathlon</option>
            <option value="amazon">Amazon</option>
            <option value="shopify">Shopify</option>
            {hasAboutYouIntegration && <option value="aboutyou">About You</option>}
            {hasKauflandIntegration && <option value="kaufland">Kaufland</option>}
            {hasEbayIntegration && <option value="ebay">eBay</option>}
            {customMiraklIntegrations.map((integration) => {
              const name = (integration.metadata as any)?.customName || 'Unbenannter Mirakl Marktplatz'
              return (
                <option key={integration.id} value={name.toLowerCase()}>
                  {name}
                </option>
              )
            })}
          </select>
          
          <select
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[150px] text-gray-900 font-medium text-sm"
          >
            <option value="all">Alle Status</option>
            <option value="pending">Pending</option>
            <option value="later_shipment">Later Shipment</option>
            <option value="shipped">Versendet</option>
            <option value="cancelled">Storniert</option>
          </select>

          <select
            value={draftCountry}
            onChange={(e) => setDraftCountry(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[120px] text-gray-900 font-medium text-sm"
          >
            <option value="all">Alle Länder</option>
            {uniqueCountries.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={draftFromDate}
              onChange={(e) => setDraftFromDate(e.target.value)}
              className="px-2 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm text-gray-900 font-medium"
              title="Von Datum"
            />
            <span className="text-gray-400 font-bold">-</span>
            <input
              type="date"
              value={draftToDate}
              onChange={(e) => setDraftToDate(e.target.value)}
              className="px-2 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm text-gray-900 font-medium"
              title="Bis Datum"
            />
          </div>

          <div className="ml-auto flex gap-2">
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-all"
            >
              Zurücksetzen
            </button>
            <button
              onClick={handleApplyFilters}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-md hover:bg-blue-700 transition-all shadow-md flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Suche
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        {filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {orders.length === 0 ? 'Noch keine Bestellungen importiert.' : 'Keine Bestellungen entsprechen den Filtern.'}
          </div>
        ) : (
          <table className="min-w-[1200px] w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={paginatedOrders.length > 0 && paginatedOrders.every(o => selectedIds.has(o.id))}
                    onChange={toggleAll}
                  />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Datum</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marktplatz</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bestellnummer</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kunde</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Land</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Umsatz</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)]">Aktion</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedOrders.map((order) => {
                const formattedTotal = new Intl.NumberFormat('de-DE', { style: 'currency', currency: order.currency }).format(order.totalAmount ? Number(order.totalAmount) : 0)
                const rawDate = order.marketplacePurchaseDate || order.invoice?.issuedAt || order.createdAt
                const formattedDate = (() => {
                  if (!rawDate) return 'Unbekannt'
                  try {
                    const formatter = new Intl.DateTimeFormat('de-DE', {
                      timeZone: 'Europe/Berlin',
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })
                    const parts = formatter.formatToParts(new Date(rawDate))
                    const day = parts.find(p => p.type === 'day')?.value
                    const month = parts.find(p => p.type === 'month')?.value
                    const year = parts.find(p => p.type === 'year')?.value
                    const hour = parts.find(p => p.type === 'hour')?.value
                    const minute = parts.find(p => p.type === 'minute')?.value
                    return `${day}.${month}.${year} ${hour}:${minute}`
                  } catch (e) {
                    return 'Unbekannt'
                  }
                })()
                const isSelected = selectedIds.has(order.id)
                const isExpanded = expandedIds.has(order.id)
                
                // @ts-ignore - JSON field
                const orderNumber = order.rawPayload?.orderNumber || order.marketplaceOrderId

                return (
                  <Fragment key={order.id}>
                    <tr 
                      className={`group hover:bg-gray-50 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50 hover:bg-blue-100/50' : ''}`}
                      onClick={() => toggleExpand(order.id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleOne(order.id)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" suppressHydrationWarning>
                        {formattedDate}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize" 
                          style={getMarketplaceBadgeStyle(order.marketplace)}>
                          {formatMarketplaceName(order.marketplace)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                          order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          order.status === 'later_shipment' ? 'bg-purple-100 text-purple-800' :
                          order.status === 'shipped' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {order.status === 'later_shipment' ? 'Later Shipment' : order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {orderNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {/* @ts-ignore */}
                        {order.buyerName || order.buyer?.name || 'Unbekannt'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(() => {
                          const raw = order.shippingCountry ?? ''
                          const iso3to2: Record<string, string> = {
                            DEU: 'DE', AUT: 'AT', CHE: 'CH', FRA: 'FR', NLD: 'NL',
                            BEL: 'BE', POL: 'PL', CZE: 'CZ', SVK: 'SK', LUX: 'LU',
                            ITA: 'IT', ESP: 'ES', GBR: 'GB', USA: 'US', CHN: 'CN',
                          }
                          const code = raw.length === 3 ? (iso3to2[raw.toUpperCase()] ?? raw.slice(0, 2)) : raw.toUpperCase()
                          return code ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200 tracking-wide font-mono">
                              {code}
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                        {formattedTotal}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 transition-colors shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${
                        isSelected 
                          ? 'bg-blue-50 group-hover:bg-blue-100/50' 
                          : 'bg-white group-hover:bg-gray-50'
                      }`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(order.id)
                          }}
                          className="text-red-400 hover:text-red-600 transition-colors p-1 rounded-md hover:bg-red-50"
                          title="Bestellung löschen"
                        >
                          <svg className="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                    
                    {isExpanded && (
                      <tr className="bg-gray-50 border-t border-b border-gray-100">
                        <td colSpan={8} className="px-6 py-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Addresses & Info */}
                            <div>
                              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Bestelldetails</h4>
                              <div className="space-y-4 text-sm text-gray-700">
                                <div>
                                  <span className="font-medium">System Auftrags-ID:</span> <span className="text-gray-500">{order.marketplaceOrderId}</span>
                                </div>
                                <div>
                                  <span className="font-medium">MwSt. (Gesamt):</span> <span className="text-gray-500">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: order.currency }).format(order.taxAmount ? Number(order.taxAmount) : 0)}</span>
                                </div>
                                <div>
                                  <span className="font-medium">Gesamtbetrag (Brutto):</span> <span className="text-gray-900 font-bold">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: order.currency }).format(order.totalAmount ? Number(order.totalAmount) : 0)}</span>
                                </div>
                                <div>
                                  <span className="font-medium">Dokumente:</span>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    <button 
                                      onClick={() => window.open(`/api/orders/${order.id}/delivery-note`, '_blank')}
                                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
                                    >
                                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                      Lieferschein öffnen
                                    </button>

                                    {/* @ts-ignore */}
                                    {order.invoiceId && (
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleOpenInvoice(order.invoiceId!)
                                        }}
                                        disabled={loadingInvoiceId === order.invoiceId}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-100 transition-all shadow-sm disabled:opacity-50"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        {loadingInvoiceId === order.invoiceId ? 'Lädt...' : 'Rechnung öffnen'}
                                      </button>
                                    )}

                                    {order.status === 'pending' && (
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleStatusUpdate(order.id, 'later_shipment')
                                        }}
                                        disabled={isUpdatingStatus === order.id}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 border border-purple-200 rounded-lg text-xs font-bold text-purple-700 hover:bg-purple-100 transition-all shadow-sm disabled:opacity-50"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        {isUpdatingStatus === order.id ? 'Lädt...' : 'Versand auf später'}
                                      </button>
                                    )}

                                    {order.status === 'later_shipment' && (
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleStatusUpdate(order.id, 'pending')
                                        }}
                                        disabled={isUpdatingStatus === order.id}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-50 border border-yellow-200 rounded-lg text-xs font-bold text-yellow-700 hover:bg-yellow-100 transition-all shadow-sm disabled:opacity-50"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        {isUpdatingStatus === order.id ? 'Lädt...' : 'Zurück zu Pending'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {/* Weight display - now enabled after DB migration */}
                                <div>
                                  <span className="font-medium">Gesamtgewicht:</span> <span className="text-gray-500">{order.totalWeight ? `${Number(order.totalWeight).toFixed(3)} kg` : 'Nicht hinterlegt'}</span>
                                </div>
                                {order.trackingNumber && (
                                  <div>
                                    <span className="font-medium">Sendungsnummer:</span> <span className="text-gray-500">{order.trackingNumber}</span>
                                  </div>
                                )}
                                {order.labelUrl && (
                                  <div>
                                    <span className="font-medium">Versandetikett:</span> 
                                    <button 
                                      onClick={() => openLabel(order.labelUrl!)}
                                      className="ml-2 text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
                                    >
                                      Label öffnen
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                    </button>
                                    <span className="text-xs text-gray-400 ml-2">
                                      {(() => {
                                        const date = new Date(order.updatedAt)
                                        const dateStr = date.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
                                        const timeStr = date.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
                                        return `(erstellt am ${dateStr} um ${timeStr} Uhr)`
                                      })()}
                                    </span>
                                  </div>
                                )}
                                {order.returnTrackingNumber && (
                                  <div>
                                    <span className="font-medium">Retouren-Nr:</span> <span className="text-gray-500">{order.returnTrackingNumber}</span>
                                  </div>
                                )}
                                {order.returnLabelUrl && (
                                  <div>
                                    <span className="font-medium">Retourenetikett:</span> 
                                    <button 
                                      onClick={() => openLabel(order.returnLabelUrl!)}
                                      className="ml-2 text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
                                    >
                                      Label herunterladen
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                    </button>
                                  </div>
                                )}
                                <div>
                                  <span className="font-medium">Rechnungsadresse:</span>
                                  <div className="mt-1 text-gray-600 bg-white p-3 rounded-md border border-gray-200">
                                    {order.buyerName || order.buyerEmail}<br/>
                                    {(() => {
                                      const addr = getBillingAddress(order)
                                      if (!addr) return <span>Keine Rechnungsadresse hinterlegt</span>
                                      return (
                                        <>
                                          {addr.street}<br/>
                                          {addr.zip} {addr.city}<br/>
                                          {formatCountry(addr.country)}
                                        </>
                                      )
                                    })()}
                                  </div>
                                </div>
                                 {editingAddressId === order.id ? (
                                  <div>
                                    <span className="font-medium">Lieferadresse bearbeiten:</span>
                                    <div className="mt-1 space-y-2 bg-white p-3 rounded-md border border-gray-200">
                                      <div>
                                        <label className="block text-[10px] uppercase font-bold text-gray-400">Name</label>
                                        <input 
                                          type="text" 
                                          value={editName} 
                                          onChange={(e) => setEditName(e.target.value)}
                                          className="w-full text-sm p-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" 
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] uppercase font-bold text-gray-400">Straße & Hausnummer</label>
                                        <input 
                                          type="text" 
                                          value={editStreet} 
                                          onChange={(e) => setEditStreet(e.target.value)}
                                          className="w-full text-sm p-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" 
                                        />
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="block text-[10px] uppercase font-bold text-gray-400">PLZ</label>
                                          <input 
                                            type="text" 
                                            value={editZip} 
                                            onChange={(e) => setEditZip(e.target.value)}
                                            className="w-full text-sm p-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" 
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] uppercase font-bold text-gray-400">Stadt</label>
                                          <input 
                                            type="text" 
                                            value={editCity} 
                                            onChange={(e) => setEditCity(e.target.value)}
                                            className="w-full text-sm p-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" 
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="block text-[10px] uppercase font-bold text-gray-400">Land (ISO 2)</label>
                                        <input 
                                          type="text" 
                                          value={editCountry} 
                                          onChange={(e) => setEditCountry(e.target.value)}
                                          maxLength={3}
                                          className="w-full text-sm p-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" 
                                        />
                                      </div>
                                      <div className="flex justify-end gap-2 pt-1">
                                        <button 
                                          onClick={() => setEditingAddressId(null)}
                                          disabled={isUpdatingAddress}
                                          className="text-xs px-2.5 py-1.5 border border-gray-300 hover:bg-gray-50 rounded-md transition-colors"
                                        >
                                          Abbrechen
                                        </button>
                                        <button 
                                          onClick={() => handleSaveAddress(order.id)}
                                          disabled={isUpdatingAddress}
                                          className="text-xs px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors disabled:opacity-50"
                                        >
                                          {isUpdatingAddress ? 'Speichert...' : 'Speichern'}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium">Lieferadresse:</span>
                                      <button 
                                        onClick={() => startEditingAddress(order)}
                                        className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 transition-colors"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                        Bearbeiten
                                      </button>
                                    </div>
                                    <div className="mt-1 text-gray-600 bg-white p-3 rounded-md border border-gray-200">
                                      {order.shippingName}<br/>
                                      {order.shippingStreet}<br/>
                                      {order.shippingZip} {order.shippingCity}<br/>
                                      {formatCountry(order.shippingCountry)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Items List */}
                            <div>
                              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Bestellte Produkte</h4>
                              <div className="bg-white rounded-md border border-gray-200 overflow-hidden mb-4">
                                <ul className="divide-y divide-gray-200">
                                  {order.items?.map((item) => (
                                    <li key={item.id} className="p-3 hover:bg-gray-50 flex items-start gap-3">
                                      <div className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-md mt-0.5">
                                        {item.quantity}x
                                      </div>
                                      <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-900 line-clamp-2">{item.title}</p>
                                        <p className="text-xs text-gray-500 mt-1">SKU: {item.sku}</p>
                                      </div>
                                      <div className="text-right whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">
                                          {new Intl.NumberFormat('de-DE', { style: 'currency', currency: order.currency }).format(Number(item.unitPrice) * Number(item.quantity))}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                          inkl. {Number(item.taxRate) * 100}% MwSt.
                                        </div>
                                      </div>
                                    </li>
                                  ))}
                                  {(!order.items || order.items.length === 0) && (
                                    <li className="p-4 text-sm text-gray-500 text-center">Keine Produkte gefunden.</li>
                                  )}
                                </ul>
                              </div>
                              <div className="flex justify-end">
                                <button
                                  onClick={() => handleDelete(order.id)}
                                  className="text-sm text-red-600 hover:text-red-800 font-medium px-3 py-1.5 border border-red-200 hover:bg-red-50 rounded-md transition-colors flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Bestellung löschen
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Controls */}
      {filteredOrders.length > 0 && (
        <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-500">
            Zeige <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> bis <span className="font-medium">{Math.min(currentPage * pageSize, filteredOrders.length)}</span> von <span className="font-medium">{filteredOrders.length}</span> Ergebnissen
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            {/* Page Size Select on Bottom Right */}
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
              <label htmlFor="pageSizeBottom" className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Zeilen:</label>
              <select
                id="pageSizeBottom"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className="bg-transparent focus:outline-none text-sm text-gray-700 font-bold cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={999999}>Alle</option>
              </select>
            </div>

            {/* Page Navigation */}
            {totalPages > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Zurück
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1
                    if (totalPages > 5 && currentPage > 3) {
                      pageNum = currentPage - 2 + i
                      if (pageNum + (4 - i) > totalPages) {
                        pageNum = totalPages - 4 + i
                      }
                    }
                    if (pageNum <= 0) return null
                    if (pageNum > totalPages) return null

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-1 text-sm font-medium rounded-md ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Weiter
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hermes Parcel Class Modal */}
      {showHermesModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowHermesModal(false)}></div>
          <div className="relative bg-white rounded-2xl p-6 shadow-2xl w-full max-w-xl border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="mb-6">
              <h3 className="text-2xl font-black text-slate-900">Hermes Paketgrößen</h3>
              <p className="text-slate-500 text-sm mt-1">Wähle für jede Bestellung die passende Größe aus.</p>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
              {orders.filter(o => selectedIds.has(o.id) && o.status !== 'shipped').map((order) => {
                const orderNum = (order.rawPayload as any)?.orderNumber || order.marketplaceOrderId
                const currentSize = hermesSelections[order.id] || 'S'
                const skus = order.items?.map(item => item.sku).filter(Boolean) || []
                
                return (
                  <div key={order.id} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-xs font-bold text-blue-600 uppercase tracking-wider">Bestellung</div>
                        <div className="font-black text-slate-900">{orderNum}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Empfänger</div>
                        <div className="text-sm font-bold text-slate-700">{order.buyerName || 'Unbekannt'}</div>
                      </div>
                    </div>
                    
                    {skus.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">SKU:</span>
                        {skus.map((sku, idx) => (
                          <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 text-[10px] font-mono font-bold text-slate-600 border border-slate-200">
                            {sku}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      {['XS', 'S', 'M', 'L', 'XL'].map((size) => (
                        <button
                          key={size}
                          onClick={() => setHermesSelections(prev => ({ ...prev, [order.id]: size }))}
                          className={`flex-1 py-2.5 rounded-xl font-black text-sm transition-all duration-200 border-2 ${
                            currentSize === size 
                              ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20 scale-[1.02]' 
                              : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200 hover:text-slate-600'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-8 flex gap-4 pt-4 border-t border-slate-100">
              <button 
                onClick={() => setShowHermesModal(false)} 
                className="flex-1 py-4 bg-white border-2 border-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-50 hover:border-slate-200 transition-all"
              >
                Abbrechen
              </button>
              <button 
                onClick={confirmGenerateHermesLabels} 
                className="flex-1 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 shadow-xl shadow-blue-600/30 transition-all transform active:scale-[0.98]"
              >
                Labels erstellen ({selectedUnshippedCount})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DHL Product & Weight Selection Modal */}
      {showDhlModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDhlModal(false)}></div>
          <div className="relative bg-white rounded-2xl p-6 shadow-2xl w-full max-w-2xl border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="mb-6">
              <h3 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                <span className="bg-yellow-400 text-gray-900 px-3 py-1 rounded-lg text-sm font-black tracking-wider uppercase">DHL</span>
                Produktauswahl & Gewichte
              </h3>
              <p className="text-slate-500 text-sm mt-1">Passe das Versandprodukt und das Gewicht (kg) für jede Sendung an.</p>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
              {orders.filter(o => selectedIds.has(o.id) && o.status !== 'shipped').map((order) => {
                const orderNum = (order.rawPayload as any)?.orderNumber || order.marketplaceOrderId
                const selection = dhlSelections[order.id] || { productCode: getDefaultDhlProductCode(order.shippingCountry, dhlConfig), weight: 1 }
                const skus = order.items?.map(item => item.sku).filter(Boolean) || []
                
                return (
                  <div key={order.id} className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="text-xs font-bold text-yellow-600 uppercase tracking-wider">Bestellung</div>
                        <div className="font-black text-slate-900">{orderNum}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Empfänger & Land</div>
                        <div className="text-sm font-bold text-slate-700 flex items-center justify-end gap-1.5">
                          {order.buyerName || 'Unbekannt'}
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600 font-mono">
                            {formatCountry(order.shippingCountry)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {skus.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">SKU:</span>
                        {skus.map((sku, idx) => (
                          <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 text-[10px] font-mono font-bold text-slate-600 border border-slate-200">
                            {sku}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">DHL Produkt</label>
                        <select
                          value={selection.productCode}
                          onChange={(e) => handleDhlProductChange(order.id, e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white text-slate-800 font-bold"
                        >
                          <option value="V01PAK">DHL Paket</option>
                          <option value="V62WP">Warenpost</option>
                          <option value="V66WPI">Warenpost International</option>
                          <option value="V86PARCEL">DHL Kleinpaket</option>
                          <option value="V87PARCEL">DHL Kleinpaket International</option>
                          <option value="V06PAK">DHL Paket International</option>
                          <option value="V53WPAK">DHL Europaket</option>
                          <option value="V55PAK">DHL Paket Connect</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Gewicht (in kg)</label>
                        <div className="flex">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={selection.weight}
                            onChange={(e) => handleDhlWeightChange(order.id, Number(e.target.value))}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-l-xl focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-slate-800 font-bold"
                            placeholder="z.B. 0.2"
                          />
                          <span className="px-3 py-2 bg-slate-100 border border-l-0 border-slate-200 rounded-r-xl text-slate-600 font-bold text-sm">
                            kg
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-8 flex gap-4 pt-4 border-t border-slate-100">
              <button 
                onClick={() => setShowDhlModal(false)} 
                className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors text-sm"
              >
                Abbrechen
              </button>
              <button 
                onClick={confirmGenerateDhlLabels} 
                className="flex-1 py-3 bg-yellow-400 hover:bg-yellow-500 text-gray-900 rounded-xl font-black shadow-lg shadow-yellow-400/20 transition-all text-sm"
              >
                Labels generieren
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[99999] flex items-center gap-3 bg-white/90 backdrop-blur-md border border-slate-100 shadow-2xl p-4 rounded-xl max-w-md animate-in slide-in-from-top-5 duration-300">
          <div className={`p-2 rounded-lg ${
            toast.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
            toast.type === 'error' ? 'bg-rose-50 text-rose-600' :
            'bg-blue-50 text-blue-600'
          }`}>
            {toast.type === 'success' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {toast.type === 'error' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {toast.type === 'info' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 break-words whitespace-pre-wrap">{toast.message}</p>
          </div>
          <button 
            onClick={() => setToast(null)} 
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

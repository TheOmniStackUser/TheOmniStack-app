'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { 
  getInvoiceDownloadUrl, 
  regenerateInvoicePdfAction,
  getInvoiceDetailsAction,
  addInvoiceLogAction,
  sendInvoiceEmailAction,
  saveEmailTemplateAction
} from '@/app/actions/invoices'
import { getInvoiceLogsAction } from '@/app/actions/manual-invoice'

interface DeliveryNote {
  id: string
  invoiceNumber: string
  status: string
  recipientName: string | null
  recipientCountry: string | null
  totalAmount: string
  currency: string
  createdAt: Date
  pdfStorageKey: string | null
  marketplace: string | null
  cancelsInvoiceId: string | null
  isCreditNote: boolean
  documentType: string
  originalInvoiceNumber?: string | null
  originalInvoiceCreatedAt?: Date | null
}

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

const formatMarketplaceName = (mp: string | null, shippingCountry?: string | null) => {
  if (!mp || mp.toLowerCase() === 'manual') return 'Manuell'
  const lower = mp.toLowerCase()
  if (lower === 'mirakl_decathlon') return 'Decathlon'
  if (lower === 'mirakl_decathlon_eu') return 'MIRAKL Hauptaccount'
  if (lower === 'mirakl_mediamarkt') return 'MediaMarkt'
  if (lower === 'otto') return 'Otto'
  if (lower === 'shopify') return 'Shopify'
  if (lower === 'aboutyou') return 'About You'
  if (lower === 'amazon') return 'Amazon'
  if (lower === 'kaufland') return 'Kaufland'
  if (lower === 'ebay') return 'eBay'

  let resolvedName = mp
  if (lower === 'mirakl_custom') {
    resolvedName = 'Decathlon'
  } else if (lower.includes('decathlon')) {
    resolvedName = 'Decathlon'
  } else {
    resolvedName = mp.charAt(0).toUpperCase() + mp.slice(1)
  }

  if (resolvedName.toLowerCase().startsWith('decathlon') && shippingCountry) {
    const countryCode = formatCountry(shippingCountry)
    return `Decathlon ${countryCode}`
  }

  return resolvedName
}

const getInitials = (name?: string | null) => {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const getMarketplaceBadgeStyle = (mp: string | null) => {
  const norm = mp ? mp.toLowerCase() : 'manual'
  if (norm === 'manual') {
    return { backgroundColor: '#f3f4f6', color: '#374151' }
  }
  switch (norm) {
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
      return { backgroundColor: '#f3f4f6', color: '#374151' }
  }
}

export function DeliveryNoteList({
  initialDeliveryNotes,
  hasKauflandIntegration,
  hasEbayIntegration,
  hasOttoIntegration,
  hasAboutYouIntegration,
  hasDecathlonIntegration,
  hasDecathlonEuIntegration,
  hasMediamarktIntegration,
  hasAmazonIntegration,
  hasShopifyIntegration,
  customMiraklIntegrations,
  company,
  initialEmailTemplate,
  currentUserName,
}: {
  initialDeliveryNotes: DeliveryNote[]
  hasKauflandIntegration: boolean
  hasEbayIntegration: boolean
  hasOttoIntegration: boolean
  hasAboutYouIntegration: boolean
  hasDecathlonIntegration: boolean
  hasDecathlonEuIntegration: boolean
  hasMediamarktIntegration: boolean
  hasAmazonIntegration: boolean
  hasShopifyIntegration: boolean
  customMiraklIntegrations: any[]
  company?: { email: string | null; smtpSettings?: any }
  initialEmailTemplate?: string | null
  currentUserName: string
}) {
  const router = useRouter()

  // Pagination & Filtering States
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [draftSearch, setDraftSearch] = useState('')
  const [draftCountry, setDraftCountry] = useState('all')
  const [draftMarketplace, setDraftMarketplace] = useState('all')
  const [draftFromDate, setDraftFromDate] = useState('')
  const [draftToDate, setDraftToDate] = useState('')

  const [activeFilters, setActiveFilters] = useState({
    search: '',
    country: 'all',
    marketplace: 'all',
    fromDate: '',
    toDate: '',
  })

  // Selected Delivery Note Detail View Overlay State
  const [selectedDeliveryNoteId, setSelectedDeliveryNoteId] = useState<string | null>(null)
  const [details, setDetails] = useState<any | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'comments' | 'history'>('info')

  // History Log Modal State
  const [showHistory, setShowHistory] = useState<string | null>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)

  // Mail Modal State
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendMailSender, setSendMailSender] = useState('')
  const [sendMailTo, setSendMailTo] = useState('')
  const [sendMailCc, setSendMailCc] = useState('')
  const [sendMailSubject, setSendMailSubject] = useState('')
  const [sendMailBody, setSendMailBody] = useState('')
  const [isSendingMail, setIsSendingMail] = useState(false)

  // Email Template Editor State
  const [isEditingTemplate, setIsEditingTemplate] = useState(false)
  const [templateText, setTemplateText] = useState(initialEmailTemplate || '')
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)

  // Comment input state
  const [commentText, setCommentText] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)

  // Sorting
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null)

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortField(null)
        setSortDirection(null)
      }
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const renderSortableHeader = (label: string, field: string, align: 'left' | 'right' = 'left') => {
    const isSorted = sortField === field
    return (
      <th
        scope="col"
        onClick={() => handleSort(field)}
        className={`px-6 py-4 font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 hover:text-slate-900 select-none transition-colors group ${
          align === 'right' ? 'text-right' : 'text-left'
        }`}
      >
        <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
          <span>{label}</span>
          <span className="inline-flex items-center">
            {isSorted ? (
              sortDirection === 'asc' ? (
                <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              )
            ) : (
              <svg className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
            )}
          </span>
        </div>
      </th>
    )
  }

  // Loading States
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 5000)
  }

  const handleSelectDeliveryNote = async (id: string) => {
    setSelectedDeliveryNoteId(id)
    setDetailsLoading(true)
    setActiveTab('info')
    try {
      const data = await getInvoiceDetailsAction(id)
      setDetails(data)

      const url = await getInvoiceDownloadUrl(id)
      setPdfUrl(url)
    } catch (error) {
      showToast('Fehler beim Laden der Details.', 'error')
      setSelectedDeliveryNoteId(null)
    } finally {
      setDetailsLoading(false)
    }
  }

  const handleApplyFilters = () => {
    setActiveFilters({
      search: draftSearch,
      country: draftCountry,
      marketplace: draftMarketplace,
      fromDate: draftFromDate,
      toDate: draftToDate,
    })
    setCurrentPage(1)
  }

  const handleResetFilters = () => {
    setDraftSearch('')
    setDraftCountry('all')
    setDraftMarketplace('all')
    setDraftFromDate('')
    setDraftToDate('')
    setSortField(null)
    setSortDirection(null)
    setActiveFilters({
      search: '',
      country: 'all',
      marketplace: 'all',
      fromDate: '',
      toDate: '',
    })
    setCurrentPage(1)
  }

  const handleClearSearch = () => {
    setDraftSearch('')
    setActiveFilters(prev => ({
      ...prev,
      search: ''
    }))
    setCurrentPage(1)
  }

  const handleDownload = async (id: string) => {
    try {
      setLoadingId(id)
      const url = await getInvoiceDownloadUrl(id)
      window.open(url, '_blank')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Fehler beim Laden des Lieferscheins.', 'error')
    } finally {
      setLoadingId(null)
    }
  }

  const handleRegenerate = async (id: string) => {
    try {
      setLoadingId(id)
      await regenerateInvoicePdfAction(id)
      await new Promise(resolve => setTimeout(resolve, 500))
      const url = await getInvoiceDownloadUrl(id)
      window.open(url, '_blank')
      if (selectedDeliveryNoteId === id) {
        setPdfUrl(url)
        const updated = await getInvoiceDetailsAction(id)
        setDetails(updated)
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Fehler beim Aktualisieren des Lieferscheins.', 'error')
    } finally {
      setLoadingId(null)
    }
  }

  const handleShowHistory = async (id: string) => {
    try {
      setShowHistory(id)
      setIsLoadingLogs(true)
      const result = await getInvoiceLogsAction(id)
      setLogs(result)
    } catch (error) {
      showToast('Fehler beim Laden der Historie.', 'error')
    } finally {
      setIsLoadingLogs(false)
    }
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim() || !selectedDeliveryNoteId) return
    setIsSubmittingComment(true)
    try {
      await addInvoiceLogAction(selectedDeliveryNoteId, 'comment', commentText)
      const updated = await getInvoiceDetailsAction(selectedDeliveryNoteId)
      setDetails(updated)
      setCommentText('')
      showToast('Kommentar hinzugefügt.', 'success')
    } catch (error) {
      showToast('Fehler beim Hinzufügen des Kommentars.', 'error')
    } finally {
      setIsSubmittingComment(false)
    }
  }

  const handleSendMailOpen = () => {
    if (!details) return
    const defaultSender = (company?.smtpSettings?.enabled && company.smtpSettings.fromEmail)
      ? company.smtpSettings.fromEmail
      : 'noreply@theomnistack.de'
    setSendMailSender(defaultSender)
    setSendMailTo(details.invoice.recipientEmail || '')
    setSendMailCc(company?.email || '')
    setSendMailSubject(`Lieferschein ${details.invoice.invoiceNumber}`)
    
    // Parse template content
    let parsedBody = templateText
    if (parsedBody) {
      parsedBody = parsedBody
        .replace(/\{kunde\}/g, details.invoice.recipientName || '')
        .replace(/\{belegnummer\}/g, details.invoice.invoiceNumber || '')
        .replace(/\{datum\}/g, format(new Date(details.invoice.createdAt), 'dd.MM.yyyy'))
        .replace(/\{firma\}/g, currentUserName)
    } else {
      parsedBody = `Sehr geehrte/r ${details.invoice.recipientName || 'Kunde'},\n\nanbei senden wir Ihnen den Lieferschein ${details.invoice.invoiceNumber} zu Ihrer Bestellung.\n\nMit freundlichen Grüßen,\n${currentUserName}`
    }
    setSendMailBody(parsedBody)
    setShowSendModal(true)
  }

  const handleSendMailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDeliveryNoteId || isSendingMail) return
    setIsSendingMail(true)
    try {
      const res = await sendInvoiceEmailAction({
        invoiceId: selectedDeliveryNoteId,
        recipientEmail: sendMailTo,
        ccEmail: sendMailCc || undefined,
        subject: sendMailSubject,
        messageText: sendMailBody.replace(/\n/g, '<br/>'),
        senderEmail: sendMailSender || company?.email || '',
        sendAsAttachment: true
      })
      if (res.error) {
        showToast(res.error, 'error')
      } else {
        showToast('E-Mail erfolgreich versendet!', 'success')
        setShowSendModal(false)
        const updated = await getInvoiceDetailsAction(selectedDeliveryNoteId)
        setDetails(updated)
      }
    } catch (error) {
      showToast('Fehler beim Senden der E-Mail.', 'error')
    } finally {
      setIsSendingMail(false)
    }
  }

  const handleSaveTemplateText = async () => {
    setIsSavingTemplate(true)
    try {
      const res = await saveEmailTemplateAction(templateText, 'email_delivery_note_default')
      if (res.error) {
        showToast(res.error, 'error')
      } else {
        showToast('Vorlage erfolgreich gespeichert!', 'success')
        setIsEditingTemplate(false)
      }
    } catch (error) {
      showToast('Fehler beim Speichern der Vorlage.', 'error')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const filteredDeliveryNotes = initialDeliveryNotes.filter(dn => {
    // Filter by Country
    if (activeFilters.country !== 'all') {
      const code = formatCountry(dn.recipientCountry)
      if (code !== activeFilters.country) return false
    }

    // Filter by Marketplace
    if (activeFilters.marketplace !== 'all') {
      const targetMp = activeFilters.marketplace.toLowerCase()
      const dnMp = (dn.marketplace || 'manual').toLowerCase()
      if (targetMp === 'manual') {
        if (dnMp !== 'manual' && dnMp !== '') return false
      } else if (dnMp !== targetMp) {
        return false
      }
    }

    // Filter by Date Range
    if (activeFilters.fromDate || activeFilters.toDate) {
      const dnDate = new Date(dn.createdAt)
      if (activeFilters.fromDate) {
        const start = new Date(activeFilters.fromDate)
        start.setHours(0, 0, 0, 0)
        if (dnDate < start) return false
      }
      if (activeFilters.toDate) {
        const end = new Date(activeFilters.toDate)
        end.setHours(23, 59, 59, 999)
        if (dnDate > end) return false
      }
    }

    if (activeFilters.search.trim() === '') return true
    const q = activeFilters.search.toLowerCase()
    return (
      dn.invoiceNumber.toLowerCase().includes(q) ||
      (dn.recipientName || '').toLowerCase().includes(q)
    )
  })

  // Sort delivery notes if sorting is active
  const sortedDeliveryNotes = [...filteredDeliveryNotes].sort((a, b) => {
    if (!sortField || !sortDirection) return 0

    let valA: any = null
    let valB: any = null

    switch (sortField) {
      case 'createdAt':
        valA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        valB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        break
      case 'invoiceNumber':
        valA = a.invoiceNumber || ''
        valB = b.invoiceNumber || ''
        break
      case 'marketplace':
        valA = formatMarketplaceName(a.marketplace, a.recipientCountry)
        valB = formatMarketplaceName(b.marketplace, b.recipientCountry)
        break
      case 'recipientName':
        valA = a.recipientName || ''
        valB = b.recipientName || ''
        break
      case 'recipientCountry':
        valA = formatCountry(a.recipientCountry)
        valB = formatCountry(b.recipientCountry)
        break
      default:
        return 0
    }

    const isEmpty = (val: any) => val === null || val === undefined || val === ''
    const isEmptyA = isEmpty(valA)
    const isEmptyB = isEmpty(valB)

    if (isEmptyA && isEmptyB) return 0
    if (isEmptyA) return 1
    if (isEmptyB) return -1

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortDirection === 'asc' ? valA - valB : valB - valA
    }

    return sortDirection === 'asc'
      ? String(valA).localeCompare(String(valB), 'de', { numeric: true, sensitivity: 'base' })
      : String(valB).localeCompare(String(valA), 'de', { numeric: true, sensitivity: 'base' })
  })

  // Pagination Logic
  const totalPages = Math.ceil(sortedDeliveryNotes.length / pageSize)
  const paginatedDeliveryNotes = sortedDeliveryNotes.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // Get unique countries for filter
  const uniqueCountries = Array.from(new Set(initialDeliveryNotes.map(dn => {
    return formatCountry(dn.recipientCountry)
  }))).filter(Boolean).sort()

  if (initialDeliveryNotes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900">Keine Lieferscheine gefunden</h3>
        <p className="text-slate-500 mt-1">Sobald Bestellungen bearbeitet werden, erscheinen hier die Lieferscheine.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[250] bg-slate-900 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-5">
        {/* Row 1: Search */}
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex-1 w-full">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Lieferscheinnummer oder Kunde suchen..."
                className="block w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg leading-5 bg-slate-50/30 text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
              />
              {draftSearch && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  title="Suche leeren"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="text-sm text-slate-500 font-medium px-2 bg-slate-50 py-2 rounded-lg border border-slate-100 min-w-[120px] text-center">
            {filteredDeliveryNotes.length} {filteredDeliveryNotes.length === 1 ? 'Lieferschein' : 'Lieferscheine'}
          </div>
        </div>

        {/* Row 2: Filters & Actions */}
        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-100">
          <select
            value={draftCountry}
            onChange={(e) => setDraftCountry(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[140px] text-sm text-slate-900 font-medium"
          >
            <option value="all">Alle Länder</option>
            {uniqueCountries.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={draftMarketplace}
            onChange={(e) => setDraftMarketplace(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px] text-sm text-slate-900 font-medium"
          >
            <option value="all">Alle Marktplätze</option>
            <option value="manual">Manuell</option>
            {hasOttoIntegration && <option value="otto">Otto</option>}
            {hasAboutYouIntegration && <option value="aboutyou">About You</option>}
            {hasDecathlonIntegration && <option value="mirakl_decathlon">Decathlon</option>}
            {hasDecathlonEuIntegration && <option value="mirakl_decathlon_eu">Decathlon EU</option>}
            {hasMediamarktIntegration && <option value="mirakl_mediamarkt">MediaMarkt</option>}
            {hasAmazonIntegration && <option value="amazon">Amazon</option>}
            {hasShopifyIntegration && <option value="shopify">Shopify</option>}
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

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={draftFromDate}
              onChange={(e) => setDraftFromDate(e.target.value)}
              className="px-2 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 font-medium"
              title="Von Datum"
            />
            <span className="text-slate-300 font-bold">-</span>
            <input
              type="date"
              value={draftToDate}
              onChange={(e) => setDraftToDate(e.target.value)}
              className="px-2 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 font-medium"
              title="Bis Datum"
            />
          </div>

          <div className="ml-auto flex gap-2">
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
            >
              Zurücksetzen
            </button>
            <button
              onClick={handleApplyFilters}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Suche
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="w-full text-left border-collapse text-sm min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {renderSortableHeader('Datum', 'createdAt')}
              {renderSortableHeader('Lieferscheinnummer', 'invoiceNumber')}
              {renderSortableHeader('Marktplatz', 'marketplace')}
              {renderSortableHeader('Kunde', 'recipientName')}
              {renderSortableHeader('Land', 'recipientCountry')}
              <th scope="col" className="px-6 py-4 font-semibold text-slate-700 text-left">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {paginatedDeliveryNotes.map((dn) => (
              <tr 
                key={dn.id} 
                onClick={() => handleSelectDeliveryNote(dn.id)} 
                className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <td className="px-6 py-4 text-slate-600">
                  {format(new Date(dn.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                </td>
                <td className="px-6 py-4 font-medium text-slate-900">
                  {dn.invoiceNumber}
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize" 
                    style={getMarketplaceBadgeStyle(dn.marketplace)}>
                    {formatMarketplaceName(dn.marketplace, dn.recipientCountry)}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-600">
                  {dn.recipientName || '–'}
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 tracking-wide font-mono">
                    {formatCountry(dn.recipientCountry)}
                  </span>
                </td>
                <td className="px-6 py-4 text-left">
                  <div className="flex justify-start gap-2 min-w-max whitespace-nowrap">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(dn.id); }}
                      disabled={loadingId === dn.id || !dn.pdfStorageKey}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-100 transition-all disabled:opacity-50"
                      title="PDF herunterladen"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                      </svg>
                      {loadingId === dn.id ? '...' : 'PDF'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRegenerate(dn.id); }}
                      disabled={loadingId === dn.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-all disabled:opacity-50"
                      title="PDF aktualisieren"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Update
                    </button>
                    {dn.marketplace === 'manual' && (
                      <>
                        <a
                          href={`/delivery-notes/new?edit=${dn.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-700 hover:bg-amber-100 transition-all"
                          title="Lieferschein bearbeiten"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Bearbeiten
                        </a>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleShowHistory(dn.id); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all"
                          title="Verlauf anzeigen"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Verlauf
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredDeliveryNotes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  Keine Lieferscheine entsprechen deiner Suche.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {filteredDeliveryNotes.length > 0 && (
        <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-slate-500">
            Zeige <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> bis <span className="font-medium">{Math.min(currentPage * pageSize, filteredDeliveryNotes.length)}</span> von <span className="font-medium">{filteredDeliveryNotes.length}</span> Ergebnissen
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
              <label htmlFor="pageSizeBottom" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Zeilen:</label>
              <select
                id="pageSizeBottom"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className="bg-transparent focus:outline-none text-sm text-slate-700 font-bold cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {totalPages > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-slate-300 rounded-lg bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        className={`px-3 py-1 text-sm font-medium rounded-lg ${
                          currentPage === pageNum
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-gray-700 border border-slate-300 hover:bg-slate-50'
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
                  className="px-3 py-1 border border-slate-300 rounded-lg bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Weiter
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Log Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Änderungsverlauf</h3>
                <p className="text-xs text-slate-500 font-bold uppercase mt-0.5">Interne Protokollierung der Bearbeitungen</p>
              </div>
              <button onClick={() => setShowHistory(null)} className="p-2 hover:bg-white rounded-full transition-all border border-transparent hover:border-slate-200 shadow-sm">
                ✕
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {isLoadingLogs ? (
                <div className="py-12 flex justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-bold text-slate-500 uppercase">Bisher keine Änderungen erfasst.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {logs.map((log, i) => (
                    <div key={log.id} className="relative pl-8 border-l-2 border-blue-100 pb-1 last:pb-0">
                      <div className="absolute -left-[9px] top-0 w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-sm" />
                      <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">
                        {format(new Date(log.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner">
                        <p className="text-sm text-slate-900 font-bold leading-relaxed">
                          {log.note}
                        </p>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-400 font-bold uppercase">
                        Revision {logs.length - i}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <div className="text-xs font-bold text-slate-500 uppercase">
                Insgesamt <span className="text-blue-600">{logs.length}</span> {logs.length === 1 ? 'Bearbeitung' : 'Bearbeitungen'}
              </div>
              <button 
                onClick={() => setShowHistory(null)}
                className="px-6 py-2 bg-slate-900 text-white text-xs font-black uppercase rounded-lg hover:bg-slate-800 transition-all shadow-md"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split View Detail Overlay */}
      {selectedDeliveryNoteId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex justify-end">
          <div className="flex w-full h-full">
            {/* Left Canvas - PDF Preview */}
            <div 
              className="flex-1 hidden md:flex items-center justify-center p-8 bg-slate-900/10 cursor-pointer"
              onClick={() => {
                setSelectedDeliveryNoteId(null)
                setDetails(null)
                setPdfUrl(null)
              }}
            >
              {detailsLoading ? (
                <div className="flex flex-col items-center gap-4 bg-white p-8 rounded-2xl shadow-xl">
                  <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                  <span className="text-sm font-semibold text-slate-600">Lade Dokumentenvorschau...</span>
                </div>
              ) : pdfUrl ? (
                <div 
                  className="w-full max-w-4xl h-full bg-white rounded-2xl shadow-2xl overflow-hidden border border-white/20 flex flex-col cursor-default"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex justify-between items-center select-none">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      PDF-VORSCHAU: {details?.invoice?.invoiceNumber}
                    </span>
                    <button 
                      onClick={() => window.open(pdfUrl, '_blank')}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                    >
                      In neuem Tab öffnen
                    </button>
                  </div>
                  <iframe src={`${pdfUrl}#toolbar=0`} className="w-full flex-1 border-none bg-slate-100" />
                </div>
              ) : (
                <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
                  <p className="text-sm font-semibold text-slate-500">PDF konnte nicht geladen werden.</p>
                </div>
              )}
            </div>

            {/* Right Sidebar Panel */}
            <div className="w-full md:w-[650px] bg-slate-50 h-full border-l border-slate-200 shadow-2xl flex flex-row overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Vertical Icon Strip */}
              <div className="w-16 bg-white border-r border-slate-100 flex flex-col items-center py-4 justify-between select-none shrink-0">
                <div className="flex flex-col gap-6 items-center w-full">
                  <button 
                    onClick={() => {
                      setSelectedDeliveryNoteId(null)
                      setDetails(null)
                      setPdfUrl(null)
                    }}
                    className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-100"
                    title="Schließen"
                  >
                    ✕
                  </button>

                  <div className="w-8 h-[1px] bg-slate-100" />

                  <button 
                    onClick={() => {
                      setActiveTab('info')
                      document.getElementById('sec-info')?.scrollIntoView({ behavior: 'smooth' })
                    }}
                    className={`p-2.5 rounded-xl transition-all flex flex-col items-center justify-center relative ${
                      activeTab === 'info' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Informationen"
                  >
                    ℹ️
                  </button>

                  <button 
                    onClick={() => {
                      setActiveTab('comments')
                      document.getElementById('sec-comments')?.scrollIntoView({ behavior: 'smooth' })
                    }}
                    className={`p-2.5 rounded-xl transition-all flex flex-col items-center justify-center relative ${
                      activeTab === 'comments' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Kommentare"
                  >
                    💬
                    <span className="absolute -top-1 -right-1 bg-slate-500 text-white rounded-full text-[9px] font-bold w-4 h-4 flex items-center justify-center border border-white">
                      {details?.invoice?.logs?.filter((l: any) => l.action === 'comment').length || 0}
                    </span>
                  </button>

                  <button 
                    onClick={() => {
                      setActiveTab('history')
                      document.getElementById('sec-history')?.scrollIntoView({ behavior: 'smooth' })
                    }}
                    className={`p-2.5 rounded-xl transition-all flex flex-col items-center justify-center relative ${
                      activeTab === 'history' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Aktivitäten"
                  >
                    📜
                    <span className="absolute -top-1 -right-1 bg-slate-500 text-white rounded-full text-[9px] font-bold w-4 h-4 flex items-center justify-center border border-white">
                      {details?.invoice?.logs?.length || 0}
                    </span>
                  </button>
                </div>
              </div>

              {/* Main Panel Content */}
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {detailsLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                  </div>
                ) : details ? (
                  <>
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            Lieferschein
                          </span>
                          <h2 className="text-xl font-black text-slate-900 tracking-tight">
                            {details.invoice.invoiceNumber}
                          </h2>
                        </div>
                        <span className="px-2.5 py-1 text-xs font-bold rounded-lg border bg-white shadow-sm" style={getMarketplaceBadgeStyle(details.linkedOrder?.marketplace || 'manual')}>
                          {formatMarketplaceName(details.linkedOrder?.marketplace || 'manual', details.linkedOrder?.shippingCountry)}
                        </span>
                      </div>
                      
                      <p className="text-xs text-slate-500 font-bold uppercase select-none">
                        Erstellt am {format(new Date(details.invoice.createdAt), 'dd. MMMM yyyy HH:mm', { locale: de })}
                        {(() => {
                          const orderNum = details.linkedOrder?.marketplace === 'manual'
                            ? (details.linkedOrder.rawPayload as any)?.manualMetadata?.orderNumber 
                            : details.linkedOrder?.marketplaceOrderId
                          return orderNum ? ` • Bestellnr. ${orderNum}` : ''
                        })()}
                      </p>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          onClick={() => window.open(pdfUrl || '', '_blank')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-sm"
                        >
                          Drucken
                        </button>
                        {(details.linkedOrder?.marketplace || 'manual') === 'manual' && (
                          <a
                            href={`/delivery-notes/new?edit=${details.invoice.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-sm"
                          >
                            Bearbeiten
                          </a>
                        )}
                        <button
                          onClick={handleSendMailOpen}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-sm"
                        >
                          Versenden
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-8 ScrollContainer">
                      {/* Section: Info */}
                      <section id="sec-info" className="space-y-6">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Empfänger & Versand</h3>
                        <div className="bg-white p-5 rounded-2xl border border-slate-150 shadow-sm space-y-4">
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Empfänger</div>
                            <div className="text-sm font-bold text-slate-800 mt-1">{details.invoice.recipientName}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {details.invoice.recipientStreet}, {details.invoice.recipientZip} {details.invoice.recipientCity}, {formatCountry(details.invoice.recipientCountry)}
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Section: Items */}
                      <section className="space-y-4">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Positionen</h3>
                        <div className="bg-white rounded-2xl border border-slate-150 shadow-sm overflow-hidden">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-150">
                                <th className="px-4 py-3 font-bold text-slate-500 w-12">Pos</th>
                                <th className="px-4 py-3 font-bold text-slate-500">Bezeichnung</th>
                                <th className="px-4 py-3 font-bold text-slate-500 w-16 text-right">Menge</th>
                              </tr>
                            </thead>
                            <tbody>
                              {details.invoice.items?.map((item: any, i: number) => (
                                <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                                  <td className="px-4 py-3 text-slate-400 font-bold">{i + 1}</td>
                                  <td className="px-4 py-3">
                                    <div className="font-bold text-slate-800">{item.description}</div>
                                    {item.sku && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{item.sku}</div>}
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold text-slate-800">{parseInt(item.quantity)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      {/* Section: Comments */}
                      <section id="sec-comments" className="space-y-4">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Kommentare</h3>
                        
                        <form onSubmit={handleAddComment} className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="Interne Notiz hinzufügen..." 
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            className="flex-1 px-4 py-2 border border-slate-200 bg-white rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                          <button 
                            type="submit" 
                            disabled={isSubmittingComment || !commentText.trim()}
                            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 disabled:opacity-50 transition-colors shrink-0"
                          >
                            Hinzufügen
                          </button>
                        </form>

                        <div className="space-y-3 mt-4">
                          {details.invoice.logs?.filter((l: any) => l.action === 'comment').length === 0 ? (
                            <p className="text-xs text-slate-400 italic text-center py-4 bg-white rounded-xl border border-slate-150 shadow-inner">Keine Kommentare erfasst.</p>
                          ) : (
                            details.invoice.logs?.filter((l: any) => l.action === 'comment').map((log: any) => (
                              <div key={log.id} className="bg-white p-4 rounded-xl border border-slate-150 shadow-sm relative group">
                                <div className="flex justify-between items-center mb-1 text-[10px] font-bold">
                                  <span className="text-blue-600">{log.user?.name || 'System'}</span>
                                  <span className="text-slate-400">{format(new Date(log.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}</span>
                                </div>
                                <p className="text-xs text-slate-800 font-bold leading-relaxed">{log.note}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </section>

                      {/* Section: History/Activity Logs */}
                      <section id="sec-history" className="space-y-4">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Aktivitäts-Historie</h3>
                        <div className="relative pl-6 border-l-2 border-slate-200/60 ml-2 py-2 space-y-6">
                          {details.invoice.logs?.map((log: any) => (
                            <div key={log.id} className="relative">
                              <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 bg-white border-2 border-slate-350 rounded-full flex items-center justify-center text-[7px]" />
                              <div className="text-[9px] font-black text-slate-400 uppercase tracking-wide">
                                {format(new Date(log.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })} • {log.user?.name || 'System'}
                              </div>
                              <p className="text-xs font-bold text-slate-700 leading-normal mt-0.5">{log.note}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Email Modal */}
      {showSendModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSendModal(false)} />
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl relative z-10 border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Beleg per E-Mail versenden</h3>
                <p className="text-xs text-slate-500 font-medium">Senden Sie diesen Lieferschein direkt an den Empfänger.</p>
              </div>
              <button onClick={() => setShowSendModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600 hover:text-slate-900 font-bold">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSendMailSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Absender E-Mail</label>
                <div className="flex items-center gap-2">
                  <select 
                    className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl bg-white text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={sendMailSender}
                    onChange={(e) => setSendMailSender(e.target.value)}
                  >
                    <option value="noreply@theomnistack.de">noreply@theomnistack.de (System-Standard)</option>
                    {company?.smtpSettings?.enabled && company.smtpSettings.fromEmail && (
                      <option value={company.smtpSettings.fromEmail}>
                        {company.smtpSettings.fromEmail} (Eigener Mailserver)
                      </option>
                    )}
                  </select>
                  <Link 
                    href="/settings#smtp-settings"
                    target="_blank"
                    className="text-blue-600 hover:text-blue-700 hover:underline shrink-0 text-xs font-bold"
                  >
                    SMTP einrichten
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Empfänger E-Mail</label>
                  <input type="email" required value={sendMailTo} onChange={(e) => setSendMailTo(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Kopie an (CC)</label>
                  <input type="email" value={sendMailCc} onChange={(e) => setSendMailCc(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Betreff</label>
                <input type="text" required value={sendMailSubject} onChange={(e) => setSendMailSubject(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Nachricht</label>
                  <button type="button" onClick={() => setIsEditingTemplate(!isEditingTemplate)} className="text-[10px] font-bold text-blue-600 hover:underline">
                    {isEditingTemplate ? 'Zurück zur Vorschau' : 'Vorlage bearbeiten'}
                  </button>
                </div>
                {isEditingTemplate ? (
                  <div className="space-y-2">
                    <textarea value={templateText} onChange={(e) => setTemplateText(e.target.value)} className="w-full h-48 px-4 py-3 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
                    <div className="text-[9px] text-slate-400 leading-normal">Platzhalter: <code className="font-bold text-slate-650 bg-slate-100 px-1 py-0.5 rounded">{`{kunde}`}</code>, <code className="font-bold text-slate-650 bg-slate-100 px-1 py-0.5 rounded">{`{belegnummer}`}</code>, <code className="font-bold text-slate-650 bg-slate-100 px-1 py-0.5 rounded">{`{datum}`}</code>, <code className="font-bold text-slate-650 bg-slate-100 px-1 py-0.5 rounded">{`{firma}`}</code></div>
                    <button type="button" disabled={isSavingTemplate} onClick={handleSaveTemplateText} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {isSavingTemplate ? 'Wird gespeichert...' : 'Vorlage für Lieferscheine speichern'}
                    </button>
                  </div>
                ) : (
                  <textarea required value={sendMailBody} onChange={(e) => setSendMailBody(e.target.value)} className="w-full h-48 px-4 py-3 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                )}
              </div>
              <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl flex items-center gap-3">
                📎 <span className="text-xs font-bold text-slate-600">Lieferschein-Dokument ({details?.invoice?.invoiceNumber}.pdf) wird automatisch angehängt.</span>
              </div>
              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowSendModal(false)} className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all">Abbrechen</button>
                <button type="submit" disabled={isSendingMail || isEditingTemplate} className="px-6 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2">
                  {isSendingMail ? 'Wird gesendet...' : 'E-Mail senden'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

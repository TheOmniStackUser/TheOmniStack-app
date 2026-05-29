'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { 
  getInvoiceDownloadUrl, 
  getInvoiceXmlAction, 
  regenerateInvoicePdfAction,
  getInvoiceDetailsAction,
  addInvoiceLogAction,
  markInvoiceAsPaidAction,
  cancelInvoiceAction,
  sendInvoiceEmailAction,
  saveEmailTemplateAction
} from '@/app/actions/invoices'
import { getInvoiceLogsAction } from '@/app/actions/manual-invoice'
import { exportInvoiceJournalAction } from '@/app/actions/export'

interface Invoice {
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
      // Custom Mirakl integration style (nice clean green)
      return { backgroundColor: '#e8f5e9', color: '#1b5e20' }
  }
}

const DEFAULT_TEMPLATE = `Sehr geehrte(r) {Empfänger},

anbei erhalten Sie Ihre Rechnung Nr. {Nummer} vom {Datum} im PDF-Format.
Sie können die Rechnung auch unter der folgenden URL abrufen und ohne PDF-Reader anzeigen lassen:
{Link}

Mit freundlichen Grüßen`

export function InvoiceList({ 
  initialInvoices,
  hasKauflandIntegration = false,
  hasEbayIntegration = false,
  hasOttoIntegration = false,
  hasAboutYouIntegration = false,
  hasDecathlonIntegration = false,
  hasDecathlonEuIntegration = false,
  hasMediamarktIntegration = false,
  hasAmazonIntegration = false,
  hasShopifyIntegration = false,
  customMiraklIntegrations = [],
  company,
  initialEmailTemplate = null,
  currentUserName = '',
}: { 
  initialInvoices: Invoice[]
  hasKauflandIntegration?: boolean
  hasEbayIntegration?: boolean
  hasOttoIntegration?: boolean
  hasAboutYouIntegration?: boolean
  hasDecathlonIntegration?: boolean
  hasDecathlonEuIntegration?: boolean
  hasMediamarktIntegration?: boolean
  hasAmazonIntegration?: boolean
  hasShopifyIntegration?: boolean
  customMiraklIntegrations?: any[]
  company?: {
    email: string | null
    smtpSettings: any
  }
  initialEmailTemplate?: string | null
  currentUserName?: string
}) {
  const router = useRouter()
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(current => current?.message === message ? null : current)
    }, 5000)
  }

  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [showHistory, setShowHistory] = useState<string | null>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)

  // Detailed Split View state
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [details, setDetails] = useState<{ invoice: any, linkedOrder: any } | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [isAddingComment, setIsAddingComment] = useState(false)
  const [isSimulatingSend, setIsSimulatingSend] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'versions' | 'comments' | 'history'>('info')

  // Send Modal States
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendDate, setSendDate] = useState('')
  const [selfSend, setSelfSend] = useState(false)
  const [senderEmail, setSenderEmail] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [ccEmail, setCcEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [messageText, setMessageText] = useState('')
  const [digitalSign, setDigitalSign] = useState(false)
  const [sendAsAttachment, setSendAsAttachment] = useState(true)
  const [mergePdfs, setMergePdfs] = useState(false)
  const [docFormat, setDocFormat] = useState('Standard PDF')
  const [emailTemplate, setEmailTemplate] = useState(initialEmailTemplate || DEFAULT_TEMPLATE)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelInvoiceId, setCancelInvoiceId] = useState<string | null>(null)

  const handleSelectInvoice = async (invoiceId: string) => {
    try {
      setShowMoreMenu(false)
      setDetailsLoading(true)
      setSelectedInvoiceId(invoiceId)
      const [detailData, downloadUrl] = await Promise.all([
        getInvoiceDetailsAction(invoiceId),
        getInvoiceDownloadUrl(invoiceId)
      ])
      setDetails(detailData)
      setPdfUrl(downloadUrl)

      // Prepopulate email modal states
      const inv = detailData.invoice
      const recEmail = inv.recipientEmail || ''
      const invNumber = inv.invoiceNumber || ''
      const invDate = format(new Date(inv.createdAt), 'dd.MM.yyyy', { locale: de })

      const defaultSender = (company?.smtpSettings?.enabled && company.smtpSettings.fromEmail)
        ? company.smtpSettings.fromEmail
        : 'noreply@theomnistack.de'

      const resolvedText = emailTemplate
        .split('{Empfänger}').join(inv.recipientName || 'Kunde')
        .split('{Nummer}').join(invNumber)
        .split('{Datum}').join(invDate)
        .split('{Link}').join(downloadUrl)

      setSendDate(invDate)
      setSelfSend(false)
      setSenderEmail(defaultSender)
      setRecipientEmail(recEmail)
      setCcEmail('')
      setSubject(`Rechnung-${invNumber}`)
      setMessageText(resolvedText)
      setDigitalSign(false)
      setSendAsAttachment(true)
      setMergePdfs(false)
      setDocFormat('Standard PDF')
    } catch (error) {
      console.error(error)
      showToast(error instanceof Error ? error.message : 'Fehler beim Laden der Rechnungsdetails.', 'error')
      setSelectedInvoiceId(null)
    } finally {
      setDetailsLoading(false)
    }
  }

  const handleAddComment = async () => {
    if (!selectedInvoiceId || !commentText.trim()) return
    try {
      setIsAddingComment(true)
      await addInvoiceLogAction(selectedInvoiceId, 'comment', commentText)
      const updated = await getInvoiceDetailsAction(selectedInvoiceId)
      setDetails(updated)
      setCommentText('')
    } catch (error) {
      showToast('Fehler beim Speichern des Kommentars.', 'error')
    } finally {
      setIsAddingComment(false)
    }
  }

  const handleMarkAsPaid = async () => {
    if (!selectedInvoiceId) return
    try {
      await markInvoiceAsPaidAction(selectedInvoiceId)
      const updated = await getInvoiceDetailsAction(selectedInvoiceId)
      setDetails(updated)
    } catch (error) {
      showToast('Fehler beim Markieren als bezahlt.', 'error')
    }
  }

  const handleSimulateSend = async () => {
    if (!selectedInvoiceId) return
    try {
      setIsSimulatingSend(true)
      
      const result = await sendInvoiceEmailAction({
        invoiceId: selectedInvoiceId,
        recipientEmail,
        ccEmail,
        senderEmail,
        subject,
        messageText,
        sendAsAttachment
      })

      if (result.error) {
        throw new Error(result.error)
      }

      const updated = await getInvoiceDetailsAction(selectedInvoiceId)
      setDetails(updated)
      setShowSendModal(false)
      showToast('Rechnung wurde erfolgreich versendet.', 'success')
    } catch (error: any) {
      showToast(error.message || 'Fehler beim Versenden der Rechnung.', 'error')
    } finally {
      setIsSimulatingSend(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!selectedInvoiceId || !details) {
      showToast('Bitte wählen Sie zuerst eine Rechnung aus.', 'error')
      return
    }
    try {
      setIsSavingTemplate(true)
      
      const inv = details.invoice
      const invNumber = inv.invoiceNumber || ''
      const invDate = format(new Date(inv.createdAt), 'dd.MM.yyyy', { locale: de })
      const recipientVal = inv.recipientName || 'Kunde'
      
      let templateText = messageText
      
      // Order of replacement is crucial: URL first!
      if (pdfUrl) {
        templateText = templateText.split(pdfUrl).join('{Link}')
      }
      if (recipientVal) {
        templateText = templateText.split(recipientVal).join('{Empfänger}')
      }
      if (inv.recipientName && inv.recipientName !== 'Kunde') {
        templateText = templateText.split('Kunde').join('{Empfänger}')
      }
      if (invDate) {
        templateText = templateText.split(invDate).join('{Datum}')
      }
      if (invNumber) {
        templateText = templateText.split(invNumber).join('{Nummer}')
      }
      
      const result = await saveEmailTemplateAction(templateText)
      if (result.error) {
        throw new Error(result.error)
      }
      
      setEmailTemplate(templateText)
      showToast('Standardtext wurde erfolgreich als Vorlage gespeichert.', 'success')
    } catch (error: any) {
      showToast(error.message || 'Fehler beim Speichern des Standardtexts.', 'error')
    } finally {
      setIsSavingTemplate(false)
    }
  }
  // Applied Filters
  const [activeFilters, setActiveFilters] = useState({
    search: '',
    country: 'all',
    marketplace: 'all',
    fromDate: '',
    toDate: '',
  })

  // Draft Filters
  const [draftSearch, setDraftSearch] = useState('')
  const [draftCountry, setDraftCountry] = useState('all')
  const [draftMarketplace, setDraftMarketplace] = useState('all')
  const [draftFromDate, setDraftFromDate] = useState('')
  const [draftToDate, setDraftToDate] = useState('')

  // Pagination
  const [pageSize, setPageSize] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)

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

  const getInvoiceTypeLabel = (invoice: Invoice) => {
    if (invoice.cancelsInvoiceId && invoice.invoiceNumber === invoice.originalInvoiceNumber) {
      return 'Storno'
    }
    if (invoice.isCreditNote) {
      return 'Gutschrift'
    }
    if (invoice.documentType === 'quote') {
      return 'Angebot'
    }
    if (invoice.documentType === 'delivery_note') {
      return 'Lieferschein'
    }
    return 'Rechnung'
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
    setActiveFilters({
      search: '',
      country: 'all',
      marketplace: 'all',
      fromDate: '',
      toDate: '',
    })
    setSortField(null)
    setSortDirection(null)
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

  const handleDownload = async (invoiceId: string) => {
    try {
      setLoadingId(invoiceId)
      const url = await getInvoiceDownloadUrl(invoiceId)
      window.open(url, '_blank')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Fehler beim Laden der Rechnung.', 'error')
    } finally {
      setLoadingId(null)
    }
  }

  const handleDownloadXml = async (invoiceId: string, invoiceNumber: string) => {
    try {
      setLoadingId(invoiceId)
      const { xml } = await getInvoiceXmlAction(invoiceId)
      const blob = new Blob([xml], { type: 'text/xml;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `Factur-X_${invoiceNumber}.xml`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      showToast('Fehler beim Generieren der E-Rechnung (XML).', 'error')
    } finally {
      setLoadingId(null)
    }
  }

  const handleRegenerate = async (invoiceId: string) => {
    try {
      setLoadingId(invoiceId)
      await regenerateInvoicePdfAction(invoiceId)
      // Small delay to ensure storage is updated
      await new Promise(resolve => setTimeout(resolve, 500))
      const url = await getInvoiceDownloadUrl(invoiceId)
      window.open(url, '_blank')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Fehler beim Aktualisieren der Rechnung.', 'error')
    } finally {
      setLoadingId(null)
    }
  }

  const handleCreateStorno = (invoiceId: string) => {
    setCancelInvoiceId(invoiceId)
    setShowCancelConfirm(true)
  }

  const executeCancelStorno = async () => {
    if (!cancelInvoiceId) return
    setShowCancelConfirm(false)
    const invoiceId = cancelInvoiceId
    setCancelInvoiceId(null)

    try {
      setLoadingId(invoiceId)
      const result = await cancelInvoiceAction(invoiceId)
      if (result && result.success) {
        showToast(`Rechnung wurde storniert. Stornobeleg ${result.cancellationInvoiceNumber} wurde erstellt.`, 'success')
        router.refresh()
        const updated = await getInvoiceDetailsAction(invoiceId)
        setDetails(updated)
      }
    } catch (error: any) {
      showToast(error.message || 'Fehler beim Stornieren der Rechnung.', 'error')
    } finally {
      setLoadingId(null)
    }
  }

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const result = await exportInvoiceJournalAction({
        fromDate: activeFilters.fromDate,
        toDate: activeFilters.toDate,
        marketplace: activeFilters.marketplace,
        country: activeFilters.country,
      })

      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `Rechnungsausgangsbuch_${format(new Date(), 'yyyy-MM-dd')}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      showToast('Fehler beim Exportieren des Rechnungsausgangsbuchs.', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  const handleShowHistory = async (invoiceId: string) => {
    try {
      setShowHistory(invoiceId)
      setIsLoadingLogs(true)
      const result = await getInvoiceLogsAction(invoiceId)
      setLogs(result)
    } catch (error) {
      showToast('Fehler beim Laden der Historie.', 'error')
    } finally {
      setIsLoadingLogs(false)
    }
  }

  const filteredInvoices = initialInvoices.filter(invoice => {
    // Filter by Country
    if (activeFilters.country !== 'all') {
      const code = formatCountry(invoice.recipientCountry)
      if (code !== activeFilters.country) return false
    }

    // Filter by Marketplace
    if (activeFilters.marketplace !== 'all') {
      const targetMp = activeFilters.marketplace.toLowerCase()
      const invoiceMp = (invoice.marketplace || 'manual').toLowerCase()
      if (targetMp === 'manual') {
        if (invoiceMp !== 'manual' && invoiceMp !== '') return false
      } else if (invoiceMp !== targetMp) {
        return false
      }
    }

    // Filter by Date Range
    if (activeFilters.fromDate || activeFilters.toDate) {
      const invoiceDate = new Date(invoice.createdAt)
      if (activeFilters.fromDate) {
        const start = new Date(activeFilters.fromDate)
        start.setHours(0, 0, 0, 0)
        if (invoiceDate < start) return false
      }
      if (activeFilters.toDate) {
        const end = new Date(activeFilters.toDate)
        end.setHours(23, 59, 59, 999)
        if (invoiceDate > end) return false
      }
    }

    if (activeFilters.search.trim() === '') return true
    const q = activeFilters.search.toLowerCase()
    return (
      invoice.invoiceNumber.toLowerCase().includes(q) ||
      (invoice.recipientName || '').toLowerCase().includes(q)
    )
  })

  // Sort invoices if sorting is active
  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
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
      case 'type':
        valA = getInvoiceTypeLabel(a)
        valB = getInvoiceTypeLabel(b)
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
      case 'totalAmount':
        valA = Number(a.totalAmount) || 0
        valB = Number(b.totalAmount) || 0
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
  const totalPages = Math.ceil(sortedInvoices.length / pageSize)
  const paginatedInvoices = sortedInvoices.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // Get unique countries for filter
  const uniqueCountries = Array.from(new Set(initialInvoices.map(i => {
    return formatCountry(i.recipientCountry)
  }))).filter(Boolean).sort()

  if (initialInvoices.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900">Keine Rechnungen gefunden</h3>
        <p className="text-slate-500 mt-1">Sobald Bestellungen importiert werden, erscheinen hier die Rechnungen.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
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
                placeholder="Rechnungsnummer oder Kunde suchen..."
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
            {filteredInvoices.length} {filteredInvoices.length === 1 ? 'Rechnung' : 'Rechnungen'}
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
              onClick={handleExport}
              disabled={isExporting}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {isExporting ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              Export
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
        <table className="w-full text-left border-collapse text-sm min-w-[1200px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {renderSortableHeader('Datum', 'createdAt')}
              {renderSortableHeader('Belegnummer', 'invoiceNumber')}
              {renderSortableHeader('Typ', 'type')}
              {renderSortableHeader('Marktplatz', 'marketplace')}
              {renderSortableHeader('Kunde', 'recipientName')}
              {renderSortableHeader('Land', 'recipientCountry')}
              {renderSortableHeader('Betrag', 'totalAmount', 'right')}
              <th className="px-6 py-4 font-semibold text-slate-700 text-left">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {paginatedInvoices.map((invoice) => {
              const formatCustomerName = (name: string) => {
                if (name.length <= 20) return name;
                return name.match(/.{1,20}(\s|$)/g)?.join('\n') || name;
              };
              return (
                <tr 
                  key={invoice.id} 
                  onClick={() => handleSelectInvoice(invoice.id)} 
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 text-slate-600">
                    {format(new Date(invoice.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900">
                    <div className="flex flex-col">
                      <span>{invoice.invoiceNumber}</span>
                      {invoice.cancelsInvoiceId && invoice.originalInvoiceNumber && (
                        <span className={`text-[10px] font-bold mt-0.5 ${
                          invoice.invoiceNumber === invoice.originalInvoiceNumber ? 'text-rose-600' : 'text-amber-600'
                        }`}>
                          {invoice.invoiceNumber === invoice.originalInvoiceNumber ? 'Storno' : 'Gutschrift'} zu {invoice.originalInvoiceNumber} vom {format(new Date(invoice.originalInvoiceCreatedAt!), 'dd.MM.yyyy')}
                        </span>
                      )}
                      {invoice.status === 'cancelled' && (
                        <span className="text-[10px] text-red-600 font-bold mt-0.5">
                          Storniert (Stornobeleg: gleiche Nr.)
                        </span>
                      )}
                      <span className="text-[10px] text-blue-600 font-bold uppercase tracking-tighter mt-0.5">E-Rechnung (ZUGFeRD)</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      if (invoice.cancelsInvoiceId && invoice.invoiceNumber === invoice.originalInvoiceNumber) {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100">
                            Storno
                          </span>
                        )
                      }
                      if (invoice.isCreditNote) {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                            Gutschrift
                          </span>
                        )
                      }
                      if (invoice.documentType === 'quote') {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                            Angebot
                          </span>
                        )
                      }
                      if (invoice.documentType === 'delivery_note') {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200">
                            Lieferschein
                          </span>
                        )
                      }
                      return (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          Rechnung
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize" 
                      style={getMarketplaceBadgeStyle(invoice.marketplace)}>
                      {formatMarketplaceName(invoice.marketplace, invoice.recipientCountry)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    <div style={{ whiteSpace: 'pre-line' }}>
                      {formatCustomerName(invoice.recipientName || '–')}
                    </div>
                  </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 tracking-wide font-mono">
                    {formatCountry(invoice.recipientCountry)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right font-medium text-slate-900">
                  {new Intl.NumberFormat('de-DE', { style: 'currency', currency: invoice.currency }).format(
                    invoice.cancelsInvoiceId ? -Number(invoice.totalAmount) : Number(invoice.totalAmount)
                  )}
                </td>
                 <td className="px-6 py-4 text-left">
                  <div className="flex justify-start gap-2 min-w-max whitespace-nowrap">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(invoice.id); }}
                      disabled={loadingId === invoice.id || !invoice.pdfStorageKey}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-100 transition-all disabled:opacity-50"
                      title="Gespeicherte PDF herunterladen"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                      </svg>
                      {loadingId === invoice.id ? '...' : 'PDF'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRegenerate(invoice.id); }}
                      disabled={loadingId === invoice.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-all disabled:opacity-50"
                      title="PDF neu generieren (Design aktualisieren)"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Update
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownloadXml(invoice.id, invoice.invoiceNumber); }}
                      disabled={loadingId === invoice.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-50"
                      title="E-Rechnung (XML) herunterladen"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                      XML
                    </button>
                    {invoice.marketplace === 'manual' && (
                      <>
                        {invoice.status !== 'cancelled' && (
                          <a
                            href={`/invoices/new?edit=${invoice.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-700 hover:bg-amber-100 transition-all"
                            title="Rechnung bearbeiten (GoBD-konform mit Log)"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Bearbeiten
                          </a>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleShowHistory(invoice.id); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all"
                          title="Änderungsverlauf anzeigen"
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
            )
          })}
            {filteredInvoices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                  Keine Rechnungen entsprechen deiner Suche.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {filteredInvoices.length > 0 && (
        <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-slate-500">
            Zeige <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> bis <span className="font-medium">{Math.min(currentPage * pageSize, filteredInvoices.length)}</span> von <span className="font-medium">{filteredInvoices.length}</span> Ergebnissen
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            {/* Page Size Select on Bottom Right */}
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

            {/* Page Navigation */}
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

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Änderungsverlauf</h3>
                <p className="text-xs text-slate-500 font-bold uppercase mt-0.5">Interne Protokollierung der Bearbeitungen</p>
              </div>
              <button onClick={() => setShowHistory(null)} className="p-2 hover:bg-white rounded-full transition-all border border-transparent hover:border-slate-200 shadow-sm">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {isLoadingLogs ? (
                <div className="py-12 flex justify-center"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-slate-100">
                    <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
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

      {/* Invoice Detail Split View Overlay */}
      {selectedInvoiceId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex justify-end">
          {/* Main Container */}
          <div className="flex w-full h-full">
            {/* Left Canvas - PDF Preview */}
            <div 
              className="flex-1 hidden md:flex items-center justify-center p-8 bg-slate-900/10 cursor-pointer"
              onClick={() => {
                setSelectedInvoiceId(null)
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
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      PDF-VORSCHAU: {details?.invoice?.invoiceNumber}
                    </span>
                    <button 
                      onClick={() => window.open(pdfUrl, '_blank')}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
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
            <div className="w-full md:w-[650px] bg-slate-50 h-full border-l border-slate-200 shadow-2xl flex flex-row overflow-hidden">
              
              {/* Vertical Icon Strip (Left side of right panel) */}
              <div className="w-16 bg-white border-r border-slate-100 flex flex-col items-center py-4 justify-between select-none shrink-0">
                <div className="flex flex-col gap-6 items-center w-full">
                  {/* Close Cross */}
                  <button 
                    onClick={() => {
                      setSelectedInvoiceId(null)
                      setDetails(null)
                      setPdfUrl(null)
                    }}
                    className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-100"
                    title="Schließen"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  <div className="w-8 h-[1px] bg-slate-100" />

                  {/* Info Button */}
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
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>

                  {/* Versions Button */}
                  <button 
                    onClick={() => {
                      setActiveTab('versions')
                      document.getElementById('sec-versions')?.scrollIntoView({ behavior: 'smooth' })
                    }}
                    className={`p-2.5 rounded-xl transition-all flex flex-col items-center justify-center relative ${
                      activeTab === 'versions' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Versionen"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="absolute -top-1 -right-1 bg-blue-600 text-white rounded-full text-[9px] font-bold w-4 h-4 flex items-center justify-center border border-white">
                      1
                    </span>
                  </button>

                  {/* Comments Button */}
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
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="absolute -top-1 -right-1 bg-slate-500 text-white rounded-full text-[9px] font-bold w-4 h-4 flex items-center justify-center border border-white">
                      {details?.invoice?.logs?.filter((l: any) => l.action === 'comment').length || 0}
                    </span>
                  </button>

                  {/* History Button */}
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
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="absolute -top-1 -right-1 bg-slate-500 text-white rounded-full text-[9px] font-bold w-4 h-4 flex items-center justify-center border border-white">
                      {details?.invoice?.logs?.length || 0}
                    </span>
                  </button>
                </div>

                <div className="text-slate-300 text-[10px] font-bold uppercase tracking-wider -rotate-90 origin-center whitespace-nowrap mt-8">
                  OMNISTACK
                </div>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
                {detailsLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                    <span className="text-sm font-semibold text-slate-500">Lade Rechnungsdetails...</span>
                  </div>
                ) : details ? (
                  <>
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            {details.invoice.cancelsInvoiceId ? 'Storno' : (details.invoice.documentType === 'quote' ? 'Angebot' : (details.invoice.documentType === 'delivery_note' ? 'Lieferschein' : 'Rechnung'))}
                          </span>
                          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            {details.invoice.invoiceNumber}
                          </h2>
                        </div>
                        <span className="px-2.5 py-1 text-xs font-bold rounded-lg border bg-white shadow-sm flex items-center gap-1.5" style={getMarketplaceBadgeStyle(details.linkedOrder?.marketplace || 'manual')}>
                           {formatMarketplaceName(details.linkedOrder?.marketplace || 'manual', details.linkedOrder?.shippingCountry)}
                         </span>
                      </div>
                      
                      {/* Subheading */}
                      <p className="text-xs text-slate-500 font-bold uppercase truncate max-w-full">
                        {details.invoice.recipientName}
                        {details.linkedOrder && (() => {
                          const isManual = details.linkedOrder.marketplace === 'manual'
                          const orderNum = isManual 
                            ? (details.linkedOrder.rawPayload as any)?.manualMetadata?.orderNumber 
                            : details.linkedOrder.marketplaceOrderId
                          return orderNum ? ` • Bestellnr. ${orderNum}` : ''
                        })()}
                      </p>

                      {details.invoice.cancelsInvoiceId && details.invoice.originalInvoice && (
                        <div className={`mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${
                          details.invoice.invoiceNumber === details.invoice.originalInvoice.invoiceNumber
                            ? 'bg-rose-50 text-rose-700 border-rose-100'
                            : 'bg-amber-50 text-amber-700 border-amber-100'
                        }`}>
                          {details.invoice.invoiceNumber === details.invoice.originalInvoice.invoiceNumber
                            ? `Storno zu ${details.invoice.originalInvoice.invoiceNumber} vom ${format(new Date(details.invoice.originalInvoice.createdAt), 'dd.MM.yyyy')}`
                            : `Gutschrift zu ${details.invoice.originalInvoice.invoiceNumber} vom ${format(new Date(details.invoice.originalInvoice.createdAt), 'dd.MM.yyyy')}`
                          }
                        </div>
                      )}
                      {details.invoice.status === 'cancelled' && (
                        <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100 uppercase tracking-wide">
                          Rechnung storniert (Stornobeleg vorhanden)
                        </div>
                      )}

                      {/* Action Buttons Row */}
                      <div className="mt-5 flex flex-wrap gap-2">
                        {/* Drucken */}
                        <button
                          onClick={() => window.open(pdfUrl || '', '_blank')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          Drucken
                        </button>

                        {/* Bearbeiten */}
                        {(details.linkedOrder?.marketplace || 'manual') === 'manual' && details.invoice.status !== 'cancelled' && (
                          <a
                            href={`/invoices/new?edit=${details.invoice.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-sm"
                          >
                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Bearbeiten
                          </a>
                        )}

                        {/* Versenden */}
                        <button
                          onClick={() => setShowSendModal(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Versenden
                        </button>

                        {/* Bezahlt */}
                        {details.invoice.logs?.some((l: any) => l.action === 'payment') ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-bold text-emerald-700 shadow-sm">
                            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Bezahlt
                          </div>
                        ) : (
                          <button
                            onClick={handleMarkAsPaid}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                          >
                            Zahlung erfassen
                          </button>
                        )}

                        {/* Mehr Dropdown / Options Menu */}
                        <div className="relative">
                          <button 
                            type="button"
                            onClick={() => setShowMoreMenu(!showMoreMenu)}
                            className="inline-flex items-center gap-1 px-2.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-sm"
                          >
                            Mehr
                            <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {showMoreMenu && (
                            <>
                              {/* Backdrop to capture clicks outside and close the menu */}
                              <div 
                                className="fixed inset-0 z-50 cursor-default" 
                                onClick={() => setShowMoreMenu(false)}
                              />
                              <div className="absolute right-0 bottom-full mb-1 sm:bottom-auto sm:top-full sm:mt-1 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-[60] w-48 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowMoreMenu(false)
                                    window.open(pdfUrl || '', '_blank')
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-2"
                                >
                                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                  PDF download
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowMoreMenu(false)
                                    handleDownloadXml(details.invoice.id, details.invoice.invoiceNumber)
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-2"
                                >
                                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                  </svg>
                                  XML herunterladen
                                </button>
                                {details.invoice.documentType === 'invoice' && !details.invoice.isCreditNote && details.invoice.status !== 'cancelled' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowMoreMenu(false)
                                      handleCreateStorno(details.invoice.id)
                                    }}
                                    className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-2 border-t border-slate-100"
                                  >
                                    <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Storno erstellen
                                  </button>
                                )}
                                {details.invoice.documentType === 'invoice' && details.invoice.status !== 'cancelled' && (
                                  <a
                                    href={`/invoices/new?clone=${details.invoice.id}&isCreditNote=true`}
                                    onClick={() => setShowMoreMenu(false)}
                                    className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-2 border-t border-slate-100"
                                  >
                                    <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Gutschrift erstellen
                                  </a>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Scrollable sections */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-8 ScrollContainer">
                      
                      {/* Section 1: Informationen */}
                      <div id="sec-info" className="space-y-4 pt-2">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Informationen
                        </h3>
                        
                        <div className="bg-slate-50 border border-slate-100 rounded-xl overflow-hidden text-xs font-medium">
                          <div className="grid grid-cols-3 border-b border-slate-100 p-3 bg-white">
                            <span className="text-slate-400 font-semibold uppercase tracking-wider">Erstellt am</span>
                            <span className="col-span-2 text-slate-800 font-bold">
                              {format(new Date(details.invoice.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-3 border-b border-slate-100 p-3 bg-white">
                            <span className="text-slate-400 font-semibold uppercase tracking-wider">Aktualisiert am</span>
                            <span className="col-span-2 text-slate-800 font-bold">
                              {details.invoice.pdfGeneratedAt ? format(new Date(details.invoice.pdfGeneratedAt), 'dd.MM.yyyy HH:mm', { locale: de }) : '–'}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 border-b border-slate-100 p-3 bg-white">
                            <span className="text-slate-400 font-semibold uppercase tracking-wider">Vorlagen</span>
                            <span className="col-span-2 text-slate-800 font-bold">Standardvorlage (deutsch)</span>
                          </div>

                          {details.linkedOrder && (() => {
                            const isManual = details.linkedOrder.marketplace === 'manual'
                            const orderNum = isManual 
                              ? (details.linkedOrder.rawPayload as any)?.manualMetadata?.orderNumber 
                              : details.linkedOrder.marketplaceOrderId
                            return (
                              <>
                                {(!isManual || orderNum) && (
                                  <div className="grid grid-cols-3 border-b border-slate-100 p-3 bg-white">
                                    <span className="text-slate-400 font-semibold uppercase tracking-wider">Bestellnr.</span>
                                    <span className="col-span-2 text-slate-800 font-bold">{orderNum}</span>
                                  </div>
                                )}
                                <div className="grid grid-cols-3 border-b border-slate-100 p-3 bg-white">
                                  <span className="text-slate-400 font-semibold uppercase tracking-wider">Kundenportal</span>
                                  <span className="col-span-2 text-blue-600 font-bold">Nicht vorhanden</span>
                                </div>
                              </>
                            )
                          })()}

                          <div className="grid grid-cols-3 border-b border-slate-100 p-3 bg-white">
                            <span className="text-slate-400 font-semibold uppercase tracking-wider">Empfängerland</span>
                            <span className="col-span-2 text-slate-800 font-bold flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                {formatCountry(details.invoice.recipientCountry)}
                              </span>
                              {details.invoice.recipientCountry === 'DE' ? 'Deutschland' : details.invoice.recipientCountry}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 p-3 bg-white">
                            <span className="text-slate-400 font-semibold uppercase tracking-wider">Kunde</span>
                            <span className="col-span-2 text-slate-800 font-bold">
                              {details.invoice.recipientName}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="h-[1px] bg-slate-100" />

                      {/* Section 2: Versionen */}
                      <div id="sec-versions" className="space-y-4">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Versionen
                        </h3>
                        
                        <div className="space-y-3">
                          {/* Base Version 1.0 */}
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs flex justify-between items-center bg-white shadow-sm hover:border-slate-200 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                                1.0
                              </div>
                              <div>
                                <p className="font-bold text-slate-800">Version 1.0 (Original)</p>
                                <p className="text-slate-400 font-semibold mt-0.5">
                                  {(() => {
                                    const createdLog = details.invoice.logs?.find((log: any) => log.action === 'created')
                                    const creator = createdLog?.user?.name || (details.linkedOrder?.marketplace === 'manual' ? 'Bearbeiter' : 'System')
                                    return `${format(new Date(details.invoice.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })} • ${creator}`
                                  })()}
                                </p>
                              </div>
                            </div>
                            
                            <button 
                              onClick={() => window.open(pdfUrl || '', '_blank')}
                              className="p-2 hover:bg-slate-50 rounded-lg border border-slate-200 shadow-sm transition-all text-slate-500 hover:text-slate-700"
                              title="Rechnung downloaden"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                          </div>

                          {/* Chronological Edits */}
                          {details.invoice.logs && details.invoice.logs
                            .filter((log: any) => log.action === 'edited')
                            .slice()
                            .reverse()
                            .map((log: any, idx: number) => {
                              const versionNum = `1.${idx + 1}`
                              return (
                                <div key={log.id} className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs flex justify-between items-center bg-white shadow-sm hover:border-slate-200 transition-colors">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                                      {versionNum}
                                    </div>
                                    <div>
                                      <p className="font-bold text-slate-800">Version {versionNum}</p>
                                      <p className="text-slate-400 font-semibold mt-0.5">
                                        {format(new Date(log.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })} • {log.user?.name || 'Bearbeiter'}
                                      </p>
                                      {log.note && (
                                        <p className="text-[10px] text-slate-500 font-semibold italic mt-1 leading-normal">
                                          Vermerk: {log.note}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <button 
                                    onClick={() => window.open(pdfUrl || '', '_blank')}
                                    className="p-2 hover:bg-slate-50 rounded-lg border border-slate-200 shadow-sm transition-all text-slate-500 hover:text-slate-700"
                                    title="Aktuelle PDF herunterladen"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                  </button>
                                </div>
                              )
                            })}
                        </div>
                      </div>

                      <div className="h-[1px] bg-slate-100" />

                      {/* Section 3: Kommentar hinzufügen */}
                      <div id="sec-comments" className="space-y-4">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          Kommentar hinzufügen
                        </h3>
                        
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0 select-none">
                            {getInitials(currentUserName)}
                          </div>
                          <div className="flex-1 space-y-2">
                            <textarea
                              placeholder="Schreiben Sie einen Kommentar..."
                              rows={3}
                              className="w-full text-xs font-semibold p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-slate-900 placeholder:text-slate-400"
                              value={commentText}
                              onChange={(e) => setCommentText(e.target.value)}
                            />
                            <button
                              onClick={handleAddComment}
                              disabled={isAddingComment || !commentText.trim()}
                              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-40"
                            >
                              {isAddingComment ? 'Speichert...' : 'Speichern'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="h-[1px] bg-slate-100" />

                      {/* Section 4: Aktivitäten */}
                      <div id="sec-history" className="space-y-4 pb-12">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Aktivitäten
                        </h3>
                        
                        {details.invoice.logs && details.invoice.logs.length > 0 ? (
                          <div className="space-y-4">
                            {details.invoice.logs.map((log: any) => {
                              const isComment = log.action === 'comment'
                              const isPayment = log.action === 'payment'
                              const isEmail = log.action === 'email'
                              
                              return (
                                <div key={log.id} className="relative pl-6 border-l border-slate-100 last:pb-0">
                                  {/* Dot indicator */}
                                  <div className={`absolute -left-[5px] top-1 w-2.5 h-2.5 bg-white border-2 rounded-full shadow-sm ${
                                    isPayment ? 'border-emerald-500' : isComment ? 'border-blue-500' : isEmail ? 'border-amber-500' : 'border-slate-400'
                                  }`} />
                                  
                                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-2">
                                    <span>{format(new Date(log.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}</span>
                                    <span>•</span>
                                    <span className="text-slate-500">
                                      {log.action === 'email' ? 'System' : (log.user?.name || 'Bearbeiter')}
                                    </span>
                                    {isPayment && <span className="text-emerald-600 font-bold uppercase text-[9px]">Zahlung</span>}
                                    {isComment && <span className="text-blue-600 font-bold uppercase text-[9px]">Kommentar</span>}
                                    {isEmail && <span className="text-amber-600 font-bold uppercase text-[9px]">E-Mail</span>}
                                  </div>
                                  
                                  <p className="text-xs font-semibold text-slate-700 mt-1 leading-relaxed">
                                    {log.note}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="py-6 text-center bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs font-bold text-slate-400 uppercase">Bisher keine Aktivitäten protokolliert.</p>
                          </div>
                        )}
                      </div>
                      
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Document Modal (Easybill-like E-Mail Modal) */}
      {showSendModal && details && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Dokument versenden</h3>
              <button 
                onClick={() => setShowSendModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="p-6 overflow-y-auto space-y-5 text-slate-800 text-xs font-semibold">
              
              {/* Alert Box */}
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl p-4 leading-relaxed font-medium">
                Bitte vergewissern Sie sich vor dem Versand per E-Mail, dass die bei Ihrem Kontakt bzw. im Dokument hinterlegte E-Mail-Adresse korrekt erfasst ist.
              </div>

              {/* Form Grid */}
              <div className="space-y-4">
                
                {/* Datum */}
                <div className="grid grid-cols-4 gap-4 items-center">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Datum</span>
                  <div className="col-span-3">
                    <input 
                      type="text" 
                      className="w-full max-w-xs px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      value={sendDate}
                      onChange={(e) => setSendDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Versandart */}
                <div className="grid grid-cols-4 gap-4 items-center">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Versandart</span>
                  <div className="col-span-3 flex gap-2">
                    <button className="border border-blue-500 bg-blue-50 text-blue-700 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      E-Mail
                    </button>
                  </div>
                </div>

                {/* Absender */}
                <div className="grid grid-cols-4 gap-4 items-center">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Absender</span>
                  <div className="col-span-3 flex items-center gap-2">
                    <select 
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
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
                      className="text-blue-600 hover:text-blue-700 hover:underline shrink-0 text-sm font-semibold"
                    >
                      ändern
                    </Link>
                  </div>
                </div>

                {/* Empfänger */}
                <div className="grid grid-cols-4 gap-4 items-center">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Empfänger</span>
                  <div className="col-span-3 flex gap-2">
                    <input 
                      type="text" 
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="empfaenger@email.de"
                    />
                    <button className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-slate-600 flex items-center justify-center font-bold">
                      +
                    </button>
                  </div>
                </div>

                {/* Weitere Empfänger */}
                <div className="grid grid-cols-4 gap-4 items-center">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Weitere Empfänger</span>
                  <div className="col-span-3 flex gap-2">
                    <input 
                      type="text" 
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                      value={ccEmail}
                      onChange={(e) => setCcEmail(e.target.value)}
                      placeholder="weitere-empfaenger@email.de"
                    />
                    <button className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-slate-600 flex items-center justify-center font-bold">
                      +
                    </button>
                  </div>
                </div>

                {/* Betreff */}
                <div className="grid grid-cols-4 gap-4 items-center">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Betreff</span>
                  <div className="col-span-3">
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                </div>

                {/* Nachricht */}
                <div className="grid grid-cols-4 gap-4 items-start">
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-500 font-bold uppercase tracking-wider">Nachricht</span>
                    <button 
                      type="button"
                      onClick={handleSaveTemplate}
                      disabled={isSavingTemplate}
                      className="text-blue-600 hover:text-blue-700 hover:underline text-left mt-1 text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSavingTemplate ? 'Speichert...' : 'Standardtext ändern'}
                    </button>
                  </div>
                  <div className="col-span-3">
                    <textarea 
                      rows={6}
                      className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed font-medium font-sans text-slate-800"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                    />
                  </div>
                </div>

                {/* Options Checkboxes */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-start-2 col-span-3 space-y-2 text-slate-700">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4" 
                        checked={digitalSign}
                        onChange={(e) => setDigitalSign(e.target.checked)}
                      />
                      <span>Dokument digital signieren</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4" 
                        checked={sendAsAttachment}
                        onChange={(e) => setSendAsAttachment(e.target.checked)}
                      />
                      <span>Dokument(e) als Anhang in der E-Mail versenden</span>
                    </label>


                  </div>
                </div>

                {/* Dokumentformat */}
                <div className="grid grid-cols-4 gap-4 items-center">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Dokumentformat</span>
                  <div className="col-span-3">
                    <select 
                      className="w-full max-w-xs px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      value={docFormat}
                      onChange={(e) => setDocFormat(e.target.value)}
                    >
                      <option value="Standard PDF">Standard PDF</option>
                    </select>
                  </div>
                </div>

                {/* Anhänge */}
                <div className="grid grid-cols-4 gap-4 items-center pt-2">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Anhänge (1) :</span>
                  <div className="col-span-3 flex items-center gap-2 text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 max-w-max">
                    <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="font-bold font-mono text-[11px] truncate max-w-xs">
                      Rechnung-{details.invoice.invoiceNumber}.pdf
                    </span>
                  </div>
                </div>

              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end items-center gap-3 shrink-0">
              <button 
                onClick={() => setShowSendModal(false)}
                className="px-5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-black uppercase rounded-xl transition-all shadow-sm"
              >
                Abbrechen
              </button>
              
              <button 
                onClick={() => {
                  if (pdfUrl) {
                    window.open(pdfUrl, '_blank')
                  } else {
                    showToast('Fehler: Die Dokumentenvorschau konnte nicht geladen werden.', 'error')
                  }
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded-xl transition-all shadow-md"
              >
                Vorschau
              </button>

              <button 
                onClick={handleSimulateSend}
                disabled={isSimulatingSend}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded-xl transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSimulatingSend ? (
                  <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Versenden
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal for Cancellation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 flex flex-col p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Rechnung stornieren</h3>
                <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                  Möchten Sie diese Rechnung wirklich stornieren? Dies erstellt einen Stornobeleg und storniert die Originalrechnung. Dieser Vorgang kann nicht rückgängig gemacht werden.
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCancelConfirm(false)
                  setCancelInvoiceId(null)
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={executeCancelStorno}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                Rechnung stornieren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[99999] flex items-center gap-3 bg-white/90 backdrop-blur-md border border-slate-100 shadow-2xl p-4 rounded-xl max-w-sm animate-in slide-in-from-top-5 duration-300">
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
            <p className="text-sm font-bold text-slate-800 break-words">{toast.message}</p>
          </div>
          <button 
            onClick={() => setToast(null)} 
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
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

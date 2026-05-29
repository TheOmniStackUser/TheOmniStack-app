'use client'

import { useState, useEffect, useRef } from 'react'
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
  saveEmailTemplateAction,
  recordPaymentAction,
  sendDunningNoticeAction
} from '@/app/actions/invoices'
import { getInvoiceLogsAction, deleteDraftAction } from '@/app/actions/manual-invoice'
import { exportInvoiceJournalAction } from '@/app/actions/export'
import { getInvoiceDunningLogsAction, addDunningExclusionAction } from '@/app/actions/dunning'

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
  dueAt?: Date | string | null
  paidAt?: Date | string | null
  draftName?: string | null
  marketplaceOrderId?: string | null
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
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'drafts' | 'open' | 'overdue' | 'paid' | 'cancelled'>('all')
  const [showSearch, setShowSearch] = useState(false)

  // Row context menu state
  const [activeRowMenuId, setActiveRowMenuId] = useState<string | null>(null)

  // Payments Modal States
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null)
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [paymentMethod, setPaymentMethod] = useState('Überweisung')
  const [paymentProvider, setPaymentProvider] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentIsSettled, setPaymentIsSettled] = useState(false)
  const [paymentHasDunningFee, setPaymentHasDunningFee] = useState(false)
  const [isSavingPayment, setIsSavingPayment] = useState(false)

  // Mahnwesen Modal States
  const [showDunningModal, setShowDunningModal] = useState(false)
  const [dunningInvoice, setDunningInvoice] = useState<Invoice | null>(null)
  const [dunningType, setDunningType] = useState<'reminder' | 'first' | 'second'>('reminder')
  const [dunningSubject, setDunningSubject] = useState('')
  const [dunningBody, setDunningBody] = useState('')
  const [dunningRecipient, setDunningRecipient] = useState('')
  const [dunningSender, setDunningSender] = useState('noreply@theomnistack.de')
  const [dunningFee, setDunningFee] = useState('')
  const [dunningIncludeFee, setDunningIncludeFee] = useState(false)
  const [isSendingDunning, setIsSendingDunning] = useState(false)

  const isOverdue = (invoice: Invoice) => {
    if (invoice.status !== 'issued' || invoice.paidAt) return false
    if (!invoice.dueAt) return false
    return new Date() > new Date(invoice.dueAt)
  }

  const getOverdueDays = (dueAt?: Date | string | null) => {
    if (!dueAt) return 0
    const diffTime = new Date().getTime() - new Date(dueAt).getTime()
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
  }

  // Row menu toggle
  const toggleRowMenu = (invoiceId: string) => {
    setActiveRowMenuId(prev => prev === invoiceId ? null : invoiceId)
  }

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.row-menu-btn') && !target.closest('.row-menu-dropdown')) {
        setActiveRowMenuId(null)
      }
    }
    document.addEventListener('click', handleOutsideClick)
    return () => {
      document.removeEventListener('click', handleOutsideClick)
    }
  }, [])

  // Open Payment modal
  const handleOpenPaymentModal = (invoice: Invoice) => {
    setPaymentInvoice(invoice)
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'))
    setPaymentMethod('Überweisung')
    setPaymentProvider('')
    setPaymentReference('')
    setPaymentNote('')
    setPaymentAmount(invoice.totalAmount)
    setPaymentIsSettled(true)
    setPaymentHasDunningFee(false)
    setShowPaymentModal(true)
    setActiveRowMenuId(null)
  }

  // Open Send modal from row action
  const handleOpenSendModalFromRow = async (invoiceId: string) => {
    setActiveRowMenuId(null)
    await handleSelectInvoice(invoiceId)
    setShowSendModal(true)
  }

  // Build default dunning text for a given type and invoice
  const getDunningDefaults = (inv: Invoice, type: 'reminder' | 'first' | 'second') => {
    const num = inv.invoiceNumber
    const date = format(new Date(inv.createdAt), 'dd.MM.yyyy', { locale: de })
    const amount = new Intl.NumberFormat('de-DE', { style: 'currency', currency: inv.currency }).format(Number(inv.totalAmount))
    const due = inv.dueAt ? format(new Date(inv.dueAt), 'dd.MM.yyyy', { locale: de }) : ''
    const customer = inv.recipientName || 'Sehr geehrte Damen und Herren'

    if (type === 'reminder') {
      return {
        subject: `Zahlungserinnerung: Rechnung ${num}`,
        body: `Sehr geehrte/r ${customer},\n\nwir möchten Sie freundlich daran erinnern, dass die Zahlung für Rechnung Nr. ${num} vom ${date} in Höhe von ${amount} am ${due} fällig war.\n\nSollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.\n\nBitte überweisen Sie den offenen Betrag auf unser unten angegebenes Konto.\n\nMit freundlichen Grüßen`,
      }
    } else if (type === 'first') {
      return {
        subject: `1. Mahnung: Rechnung ${num}`,
        body: `Sehr geehrte/r ${customer},\n\ntrotz unserer Zahlungserinnerung haben wir für Rechnung Nr. ${num} vom ${date} in Höhe von ${amount} noch keinen Zahlungseingang verzeichnen können.\n\nWir bitten Sie daher, den ausstehenden Betrag umgehend zu begleichen.\n\nSollte Ihre Zahlung unsere Mahnung gekreuzt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.\n\nMit freundlichen Grüßen`,
      }
    } else {
      return {
        subject: `2. Mahnung: Rechnung ${num}`,
        body: `Sehr geehrte/r ${customer},\n\nleider mussten wir feststellen, dass unser erstes Mahnschreiben bezüglich Rechnung Nr. ${num} vom ${date} über ${amount} ohne Reaktion geblieben ist.\n\nWir fordern Sie hiermit letztmalig auf, den ausstehenden Betrag innerhalb von 7 Tagen zu begleichen.\n\nSollte bis zum Ablauf dieser Frist keine Zahlung eingehen, sehen wir uns gezwungen, weitere rechtliche Schritte einzuleiten.\n\nMit freundlichen Grüßen`,
      }
    }
  }

  // Open Mahnwesen modal from row or sidebar
  const handleOpenDunningModal = (invoice: Invoice) => {
    setDunningInvoice(invoice)
    setDunningType('reminder')
    const defaults = getDunningDefaults(invoice, 'reminder')
    setDunningSubject(defaults.subject)
    setDunningBody(defaults.body)
    setDunningRecipient((invoice as any).recipientEmail || '')
    setDunningSender(
      company?.smtpSettings?.enabled && company.smtpSettings.fromEmail
        ? company.smtpSettings.fromEmail
        : 'noreply@theomnistack.de'
    )
    setDunningFee('')
    setDunningIncludeFee(false)
    setShowDunningModal(true)
    setActiveRowMenuId(null)
  }

  // Send dunning notice
  const handleSendDunning = async () => {
    if (!dunningInvoice || !dunningRecipient) return
    try {
      setIsSendingDunning(true)
      await sendDunningNoticeAction({
        invoiceId: dunningInvoice.id,
        type: dunningType,
        subject: dunningSubject,
        body: dunningBody,
        recipientEmail: dunningRecipient,
        senderEmail: dunningSender,
        dunningFee: dunningIncludeFee && dunningFee ? dunningFee : undefined,
      })
      const stageLabel = dunningType === 'reminder' ? 'Zahlungserinnerung' : dunningType === 'first' ? '1. Mahnung' : '2. Mahnung'
      showToast(`${stageLabel} erfolgreich versendet.`, 'success')
      setShowDunningModal(false)
      if (selectedInvoiceId === dunningInvoice.id) {
        const [updatedDetails, updatedDunningLogs] = await Promise.all([
          getInvoiceDetailsAction(selectedInvoiceId),
          getInvoiceDunningLogsAction(selectedInvoiceId),
        ])
        setDetails(updatedDetails)
        setDunningLogs(updatedDunningLogs)
      }
    } catch (err: any) {
      showToast(err.message || 'Fehler beim Versenden.', 'error')
    } finally {
      setIsSendingDunning(false)
    }
  }

  // Save payments to backend
  const handleSavePayment = async () => {
    if (!paymentInvoice) return
    try {
      setIsSavingPayment(true)
      const result = await recordPaymentAction(paymentInvoice.id, {
        date: paymentDate,
        method: paymentMethod,
        provider: paymentProvider,
        reference: paymentReference,
        note: paymentNote,
        amount: paymentAmount,
        isSettled: paymentIsSettled
      })
      if (result.success) {
        showToast('Zahlungseingang wurde erfolgreich erfasst.', 'success')
        setShowPaymentModal(false)
        if (selectedInvoiceId === paymentInvoice.id) {
          const updated = await getInvoiceDetailsAction(selectedInvoiceId)
          setDetails(updated)
        }
        router.refresh()
      } else {
        throw new Error('Fehler beim Speichern der Zahlung.')
      }
    } catch (err: any) {
      showToast(err.message || 'Fehler beim Erfassen des Zahlungseingangs.', 'error')
    } finally {
      setIsSavingPayment(false)
    }
  }

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
  const [sendAsAttachment, setSendAsAttachment] = useState(true)
  const [mergePdfs, setMergePdfs] = useState(false)
  const [docFormat, setDocFormat] = useState('Standard PDF')
  const [emailTemplate, setEmailTemplate] = useState(initialEmailTemplate || DEFAULT_TEMPLATE)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelInvoiceId, setCancelInvoiceId] = useState<string | null>(null)

  // Dunning state for the detail panel
  const [dunningLogs, setDunningLogs] = useState<any[]>([])
  const [dunningLoading, setDunningLoading] = useState(false)
  const [isExcluding, setIsExcluding] = useState(false)

  const handleSelectInvoice = async (invoiceId: string) => {
    try {
      setShowMoreMenu(false)
      setDetailsLoading(true)
      setSelectedInvoiceId(invoiceId)
      setDunningLogs([]) // reset dunning logs when switching invoice
      const [detailData, downloadUrl] = await Promise.all([
        getInvoiceDetailsAction(invoiceId),
        getInvoiceDownloadUrl(invoiceId)
      ])
      setDetails(detailData)
      setPdfUrl(downloadUrl)

      // Load dunning logs for this invoice in the background
      setDunningLoading(true)
      getInvoiceDunningLogsAction(invoiceId).then((logs) => {
        setDunningLogs(logs)
        setDunningLoading(false)
      }).catch(() => setDunningLoading(false))

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

  // Unfiltered counts for status tabs
  const totalCount = initialInvoices.length
  const draftsCount = initialInvoices.filter(i => i.status === 'draft').length
  const openCount = initialInvoices.filter(i => i.status === 'issued' && !i.paidAt).length
  const overdueCount = initialInvoices.filter(i => isOverdue(i)).length
  const paidCount = initialInvoices.filter(i => i.status === 'issued' && i.paidAt).length
  const cancelledCount = initialInvoices.filter(i => i.status === 'cancelled').length

  const searchFilteredInvoices = initialInvoices.filter(invoice => {
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
      (invoice.invoiceNumber || '').toLowerCase().includes(q) ||
      (invoice.draftName || '').toLowerCase().includes(q) ||
      (invoice.recipientName || '').toLowerCase().includes(q) ||
      (invoice.marketplaceOrderId || '').toLowerCase().includes(q)
    )
  })

  // Apply tab status filter on top of search/filter
  const filteredInvoices = searchFilteredInvoices.filter(invoice => {
    switch (activeFilterTab) {
      case 'drafts':
        return invoice.status === 'draft'
      case 'open':
        return invoice.status === 'issued' && !invoice.paidAt
      case 'overdue':
        return isOverdue(invoice)
      case 'paid':
        return invoice.status === 'issued' && !!invoice.paidAt
      case 'cancelled':
        return invoice.status === 'cancelled'
      case 'all':
      default:
        return true
    }
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
      {/* Quick Filter Tabs */}
      <div className="flex flex-wrap gap-2.5 mb-2">
        {[
          { id: 'all', label: 'Alle', count: totalCount },
          { id: 'drafts', label: 'Entwürfe', count: draftsCount },
          { id: 'open', label: 'Offen', count: openCount },
          { id: 'overdue', label: 'Überfällig', count: overdueCount, isOverdue: overdueCount > 0 },
          { id: 'paid', label: 'Bezahlt', count: paidCount },
          { id: 'cancelled', label: 'Storniert', count: cancelledCount },
        ].map((tab) => {
          const isActive = activeFilterTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveFilterTab(tab.id as any)
                setCurrentPage(1)
              }}
              className={`flex flex-col items-start text-left px-5 py-3.5 rounded-xl border transition-all min-w-[115px] shadow-sm select-none ${
                isActive
                  ? 'bg-slate-50 border-slate-300 ring-1 ring-slate-300'
                  : 'bg-white border-slate-200 hover:bg-slate-50/50 hover:border-slate-300'
              }`}
            >
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                {tab.label}
              </span>
              <span className={`text-xl font-black tracking-tight leading-none ${
                isActive
                  ? 'text-blue-600'
                  : 'text-slate-900'
              }`}>
                {tab.count}
              </span>
            </button>
          )
        })}

        {/* Search Toggle Tab */}
        <button
          onClick={() => setShowSearch(!showSearch)}
          className={`flex flex-col items-start justify-center px-6 py-3.5 rounded-xl border transition-all min-w-[115px] shadow-sm select-none font-bold text-sm leading-none ${
            showSearch
              ? 'bg-slate-100 border-slate-300 ring-1 ring-slate-300 text-slate-900'
              : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-500'
          }`}
        >
          <div className="flex items-center gap-1.5 py-1">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-sm font-black text-slate-700 tracking-wide uppercase">Suchen</span>
          </div>
        </button>
      </div>

      {showSearch && (
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
      )}

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
              <th className="px-4 py-4 w-12"></th>
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
                  onClick={() => {
                    if (invoice.status === 'draft') {
                      router.push(`/invoices/new?draftId=${invoice.id}`)
                    } else {
                      handleSelectInvoice(invoice.id)
                    }
                  }} 
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 text-slate-600">
                    {format(new Date(invoice.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </td>
                  {/* Belegnummer */}
                  <td className="px-6 py-4 font-medium text-slate-900">
                    <div className="flex flex-col">
                      <span>{invoice.status === 'draft' ? (invoice.draftName || 'Unbenannter Entwurf') : invoice.invoiceNumber}</span>
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
                      {invoice.status !== 'draft' && (
                        <span className="text-[10px] text-blue-600 font-bold uppercase tracking-tighter mt-0.5">E-Rechnung (ZUGFeRD)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      if (invoice.status === 'draft') {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                            Entwurf
                          </span>
                        )
                      }
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
                  <div className="flex items-center justify-end gap-2.5">
                    {isOverdue(invoice) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100 shrink-0">
                        <svg className="w-3.5 h-3.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {getOverdueDays(invoice.dueAt)} Tage
                      </span>
                    )}
                    <span className="shrink-0">
                      {new Intl.NumberFormat('de-DE', { style: 'currency', currency: invoice.currency }).format(
                        invoice.cancelsInvoiceId ? -Number(invoice.totalAmount) : Number(invoice.totalAmount)
                      )}
                    </span>
                  </div>
                </td>
                 {/* ··· action menu – last column, right-aligned */}
                 <td className={`px-4 py-4 text-right ${isOverdue(invoice) ? 'border-r-4 border-r-rose-600' : ''}`} onClick={(e) => e.stopPropagation()}>
                   <div className="relative inline-block">
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         toggleRowMenu(invoice.id);
                       }}
                       className="row-menu-btn p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors border border-slate-200 shadow-sm bg-white"
                       title="Mehr Aktionen"
                     >
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 5v.01M12 12v.01M12 19v.01" />
                       </svg>
                     </button>

                     {activeRowMenuId === invoice.id && (
                       <div
                         className="row-menu-dropdown absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 z-[100] py-1.5 overflow-hidden text-xs text-slate-700 font-medium"
                         onClick={(e) => e.stopPropagation()}
                       >
                         {/* Section 0: Quick icon bar */}
                         <div className="flex items-center justify-around border-b border-slate-100 pb-2 px-1 gap-1">
                           <Link
                             href={invoice.status === 'draft' ? `/invoices/new?draftId=${invoice.id}` : `/invoices/new?edit=${invoice.id}`}
                             className="p-2 hover:bg-slate-50 text-slate-500 hover:text-blue-600 rounded-lg transition-colors flex items-center justify-center flex-1"
                             title="Bearbeiten"
                           >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                             </svg>
                           </Link>
                           <button
                             onClick={() => { handleDownload(invoice.id); setActiveRowMenuId(null); }}
                             disabled={!invoice.pdfStorageKey}
                             className="p-2 hover:bg-slate-50 text-slate-500 hover:text-blue-600 rounded-lg transition-colors flex items-center justify-center flex-1 disabled:opacity-40"
                             title="PDF herunterladen"
                           >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                             </svg>
                           </button>
                           <button
                             onClick={() => { handleShowHistory(invoice.id); setActiveRowMenuId(null); }}
                             className="p-2 hover:bg-slate-50 text-slate-500 hover:text-blue-600 rounded-lg transition-colors flex items-center justify-center flex-1"
                             title="Verlauf"
                           >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                             </svg>
                           </button>
                         </div>

                         {/* Section 1: PDF / Update / XML */}
                         {invoice.status !== 'draft' && (
                           <div className="border-b border-slate-100 py-1">
                             <button
                               onClick={() => { handleDownload(invoice.id); setActiveRowMenuId(null); }}
                               disabled={!invoice.pdfStorageKey}
                               className="w-full flex items-center px-3 py-2 hover:bg-slate-50 text-slate-700 font-bold transition-all text-left disabled:opacity-40"
                             >
                               <div className="flex items-center gap-2">
                                 <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                 </svg>
                                 <span>PDF herunterladen</span>
                               </div>
                             </button>
                             <button
                               onClick={() => { handleRegenerate(invoice.id); setActiveRowMenuId(null); }}
                               className="w-full flex items-center px-3 py-2 hover:bg-slate-50 text-slate-700 transition-all text-left"
                             >
                               <div className="flex items-center gap-2">
                                 <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                 </svg>
                                 <span>PDF aktualisieren</span>
                               </div>
                             </button>
                             <button
                               onClick={() => { handleDownloadXml(invoice.id, invoice.invoiceNumber); setActiveRowMenuId(null); }}
                               className="w-full flex items-center px-3 py-2 hover:bg-slate-50 text-slate-700 font-bold transition-all text-left"
                             >
                               <div className="flex items-center gap-2">
                                 <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                 </svg>
                                 <span>ZUGFeRD / XRechnung</span>
                               </div>
                             </button>
                           </div>
                         )}

                         {/* Section 2: Actions */}
                         <div className="border-b border-slate-100 py-1 flex flex-col">
                           <Link
                             href={invoice.status === 'draft' ? `/invoices/new?draftId=${invoice.id}` : `/invoices/new?edit=${invoice.id}`}
                             onClick={() => setActiveRowMenuId(null)}
                             className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700 transition-all text-left"
                           >
                             <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                             </svg>
                             <span>Bearbeiten</span>
                           </Link>
                           <button
                             onClick={() => { handleShowHistory(invoice.id); setActiveRowMenuId(null); }}
                             className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700 transition-all text-left"
                           >
                             <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                             </svg>
                             <span>Verlauf</span>
                           </button>
                           {invoice.status !== 'draft' && (
                             <button
                               onClick={() => handleOpenSendModalFromRow(invoice.id)}
                               className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700 transition-all text-left"
                             >
                               <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                               </svg>
                               <span>Versenden</span>
                             </button>
                           )}
                           {invoice.status !== 'draft' && !invoice.paidAt && invoice.status !== 'cancelled' && (
                             <button
                               onClick={() => handleOpenPaymentModal(invoice)}
                               className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700 transition-all text-left"
                             >
                               <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                               </svg>
                               <span>Zahlungen</span>
                             </button>
                           )}
                           <button
                             onClick={() => { alert('SEPA-Lastschriftdatei erstellen (Funktion folgt)'); setActiveRowMenuId(null); }}
                             className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-400 transition-all text-left cursor-not-allowed"
                           >
                             <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                             </svg>
                             <span>SEPA</span>
                           </button>
                           <button
                             onClick={() => { alert('Aufgabe für diesen Beleg erstellen (Funktion folgt)'); setActiveRowMenuId(null); }}
                             className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-400 transition-all text-left cursor-not-allowed"
                           >
                             <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 00-2 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                             </svg>
                             <span>Aufgabe erstellen</span>
                           </button>
                         </div>

                         {/* Section 3: Mahnwesen */}
                         {(invoice.status === 'issued' && !invoice.paidAt) && (
                           <div className="border-b border-slate-100 py-1">
                             <button
                               onClick={() => handleOpenDunningModal(invoice)}
                               className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-700 font-bold transition-all text-left"
                             >
                               <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                               </svg>
                               <span>Mahnwesen</span>
                             </button>
                           </div>
                         )}

                         {/* Section 4: Storno / Gutschrift / Entwurf löschen */}
                         <div className="py-1 flex flex-col">
                           {invoice.status === 'draft' && (
                             <button
                               onClick={async () => {
                                 setActiveRowMenuId(null);
                                 if (confirm('Diesen Entwurf wirklich löschen?')) {
                                   try {
                                     await deleteDraftAction(invoice.id);
                                     showToast('Entwurf wurde gelöscht.', 'success');
                                     router.refresh();
                                   } catch (err) {
                                     showToast('Fehler beim Löschen des Entwurfs.', 'error');
                                   }
                                 }
                               }}
                               className="w-full flex items-center gap-2 px-3 py-2 hover:bg-rose-50 text-rose-600 transition-all text-left"
                             >
                               <svg className="w-3.5 h-3.5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                               </svg>
                               <span>Entwurf löschen</span>
                             </button>
                           )}
                           {invoice.status !== 'draft' && invoice.status !== 'cancelled' && !invoice.isCreditNote && (
                             <button
                               onClick={() => { handleCreateStorno(invoice.id); setActiveRowMenuId(null); }}
                               className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-rose-600 transition-all text-left"
                             >
                               <svg className="w-3.5 h-3.5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                               </svg>
                               <span>Storno erstellen</span>
                             </button>
                           )}
                           {invoice.status !== 'draft' && (
                             <Link
                               href={`/invoices/new?clone=${invoice.id}&isCreditNote=true`}
                               onClick={() => setActiveRowMenuId(null)}
                               className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700 transition-all text-left"
                             >
                               <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                               </svg>
                               <span>Gutschrift erstellen</span>
                             </Link>
                           )}
                         </div>
                       </div>
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
                          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center flex-wrap gap-2">
                            {details.invoice.invoiceNumber}
                            {isOverdue(details.invoice) && (
                              <span className="px-2 py-0.5 bg-red-600 text-white text-[11px] font-bold rounded-lg uppercase tracking-wide leading-none select-none">
                                Überfällig {format(new Date(details.invoice.dueAt), 'd. MMM. yyyy', { locale: de })}
                              </span>
                            )}
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

                        {/* Mahnwesen button – only for overdue/open invoices */}
                        {details.invoice.status === 'issued' && !details.invoice.paidAt && details.invoice.status !== 'cancelled' && (
                          <button
                            onClick={() => handleOpenDunningModal(details.invoice)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            Mahnwesen
                          </button>
                        )}

                        {/* Bezahlt */}
                        {(details.invoice.paidAt || details.invoice.logs?.some((l: any) => l.action === 'payment')) ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-bold text-emerald-700 shadow-sm">
                            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Bezahlt
                          </div>
                        ) : (
                          <button
                            onClick={() => handleOpenPaymentModal(details.invoice)}
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
                      {isOverdue(details.invoice) && (
                        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 shadow-sm select-none">
                          <div className="p-2 bg-red-100/80 rounded-xl text-red-600 shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-red-950 leading-none">Mahnwesen</h4>
                            <p className="text-xs font-bold text-red-700 mt-1.5 leading-snug">
                              Überfällig seit {format(new Date(details.invoice.dueAt), 'dd. MMM. yyyy', { locale: de })} ({getOverdueDays(details.invoice.dueAt)} Tage)
                            </p>
                          </div>
                        </div>
                      )}
                      
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
                              const isDunning = isEmail && (log.note?.includes('Mahnung') || log.note?.includes('Zahlungserinnerung'))
                              
                              return (
                                <div key={log.id} className="relative pl-6 border-l border-slate-100 last:pb-0">
                                  {/* Dot indicator */}
                                  <div className={`absolute -left-[5px] top-1 w-2.5 h-2.5 bg-white border-2 rounded-full shadow-sm ${
                                    isPayment ? 'border-emerald-500' : isComment ? 'border-blue-500' : isDunning ? 'border-red-500' : isEmail ? 'border-amber-500' : 'border-slate-400'
                                  }`} />
                                  
                                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-2">
                                    <span>{format(new Date(log.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}</span>
                                    <span>•</span>
                                    <span className="text-slate-500">
                                      {log.user?.name || 'Bearbeiter'}
                                    </span>
                                    {isPayment && <span className="text-emerald-600 font-bold uppercase text-[9px]">Zahlung</span>}
                                    {isComment && <span className="text-blue-600 font-bold uppercase text-[9px]">Kommentar</span>}
                                    {isDunning && <span className="text-red-600 font-bold uppercase text-[9px]">Mahnung</span>}
                                    {isEmail && !isDunning && <span className="text-amber-600 font-bold uppercase text-[9px]">E-Mail</span>}
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

                      <div className="h-[1px] bg-slate-100" />

                      {/* Section 5: Mahnwesen */}
                      {details.invoice.documentType === 'invoice' && !details.invoice.isCreditNote && details.invoice.status !== 'cancelled' && (
                        <div id="sec-dunning" className="space-y-4 pb-12">
                          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                            <span className="text-base">🔔</span>
                            Mahnwesen
                          </h3>

                          {dunningLoading ? (
                            <div className="h-10 bg-slate-100 animate-pulse rounded-xl" />
                          ) : dunningLogs.length === 0 ? (
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-400 font-semibold text-center">
                              Noch keine Mahnungen für diese Rechnung versendet.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {dunningLogs.map((dl: any) => {
                                const stageLabel = dl.stage === 'reminder' ? '📋 Zahlungserinnerung' : dl.stage === 'first' ? '⚠️ 1. Mahnung' : '🔴 2. Mahnung'
                                const stageColor = dl.stage === 'reminder' ? '#2563eb' : dl.stage === 'first' ? '#d97706' : '#dc2626'
                                return (
                                  <div key={dl.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl p-3 text-xs">
                                    <span className="font-bold" style={{ color: stageColor }}>{stageLabel}</span>
                                    <span className="text-slate-400">•</span>
                                    <span className="text-slate-500">{format(new Date(dl.sentAt), 'dd.MM.yyyy HH:mm', { locale: de })}</span>
                                    {dl.status === 'sent' ? (
                                      <span className="ml-auto text-emerald-600 font-bold text-[10px] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Gesendet</span>
                                    ) : (
                                      <span className="ml-auto text-red-600 font-bold text-[10px] bg-red-50 border border-red-200 px-2 py-0.5 rounded-full" title={dl.errorMessage || ''}>Fehler</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {/* Exclude from dunning */}
                          {details.invoice.recipientEmail && (
                            <button
                              onClick={async () => {
                                setIsExcluding(true)
                                try {
                                  const result = await addDunningExclusionAction(details.invoice.recipientEmail, 'Manuell ausgeschlossen aus Rechnungsansicht')
                                  if ((result as any).error) throw new Error((result as any).error)
                                  showToast(`${details.invoice.recipientEmail} vom Mahnwesen ausgeschlossen.`, 'success')
                                } catch (err: any) {
                                  showToast(err.message || 'Fehler.', 'error')
                                } finally {
                                  setIsExcluding(false)
                                }
                              }}
                              disabled={isExcluding}
                              className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors disabled:opacity-50"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                              {isExcluding ? 'Wird ausgeschlossen...' : 'Kunden vom Mahnwesen ausschließen'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mahnwesen Modal ─────────────────────────────────────────────── */}
      {showDunningModal && dunningInvoice && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[75] flex items-center justify-center p-4">
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-red-50 to-rose-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-xl">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Mahnwesen</h3>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">Rechnung {dunningInvoice.invoiceNumber} · {dunningInvoice.recipientName}</p>
                </div>
              </div>
              <button
                onClick={() => setShowDunningModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Type Selector */}
            <div className="px-6 pt-5 pb-3 border-b border-slate-100 bg-white">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Art der Nachricht</p>
              <div className="flex gap-2">
                {([
                  { value: 'reminder', label: '📋 Zahlungserinnerung', desc: 'Freundliche Erinnerung' },
                  { value: 'first', label: '⚠️ 1. Mahnung', desc: 'Erste Mahnung' },
                  { value: 'second', label: '🔴 2. Mahnung', desc: 'Letzte Mahnung' },
                ] as const).map(({ value, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setDunningType(value)
                      const defaults = getDunningDefaults(dunningInvoice, value)
                      setDunningSubject(defaults.subject)
                      setDunningBody(defaults.body)
                    }}
                    className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all text-left ${
                      dunningType === value
                        ? value === 'reminder' ? 'bg-blue-600 border-blue-600 text-white shadow-md' : value === 'first' ? 'bg-amber-500 border-amber-500 text-white shadow-md' : 'bg-red-600 border-red-600 text-white shadow-md'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div>{label}</div>
                    <div className={`text-[10px] mt-0.5 font-semibold ${dunningType === value ? 'text-white/80' : 'text-slate-400'}`}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs font-semibold text-slate-800">

              {/* Absender */}
              <div className="grid grid-cols-4 gap-4 items-center">
                <span className="text-slate-500 font-bold uppercase tracking-wider">Absender</span>
                <div className="col-span-3">
                  <select
                    value={dunningSender}
                    onChange={(e) => setDunningSender(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-400 font-medium"
                  >
                    <option value="noreply@theomnistack.de">noreply@theomnistack.de (System-Standard)</option>
                    {company?.smtpSettings?.enabled && company.smtpSettings.fromEmail && (
                      <option value={company.smtpSettings.fromEmail}>
                        {company.smtpSettings.fromEmail} (Eigener Mailserver)
                      </option>
                    )}
                  </select>
                </div>
              </div>

              {/* Empfänger */}
              <div className="grid grid-cols-4 gap-4 items-center">
                <span className="text-slate-500 font-bold uppercase tracking-wider">Empfänger</span>
                <div className="col-span-3">
                  <input
                    type="email"
                    value={dunningRecipient}
                    onChange={(e) => setDunningRecipient(e.target.value)}
                    placeholder="empfaenger@email.de"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 font-medium text-slate-800"
                  />
                </div>
              </div>

              {/* Betreff */}
              <div className="grid grid-cols-4 gap-4 items-center">
                <span className="text-slate-500 font-bold uppercase tracking-wider">Betreff</span>
                <div className="col-span-3">
                  <input
                    type="text"
                    value={dunningSubject}
                    onChange={(e) => setDunningSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 font-medium text-slate-800"
                  />
                </div>
              </div>

              {/* Nachricht */}
              <div className="grid grid-cols-4 gap-4 items-start">
                <span className="text-slate-500 font-bold uppercase tracking-wider pt-2">Nachricht</span>
                <div className="col-span-3">
                  <textarea
                    rows={9}
                    value={dunningBody}
                    onChange={(e) => setDunningBody(e.target.value)}
                    className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 leading-relaxed font-medium font-sans text-slate-800 resize-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">Der Standardtext kann frei bearbeitet werden. Die Rechnung wird automatisch als PDF-Anhang beigefügt.</p>
                </div>
              </div>

              {/* Mahngebühr – nur für Mahnungen */}
              {dunningType !== 'reminder' && (
                <div className="grid grid-cols-4 gap-4 items-start pt-1">
                  <span className="text-slate-500 font-bold uppercase tracking-wider pt-2">Mahngebühr</span>
                  <div className="col-span-3 space-y-2.5">
                    <label className="flex items-center gap-2.5 text-xs text-slate-700 font-semibold select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dunningIncludeFee}
                        onChange={(e) => setDunningIncludeFee(e.target.checked)}
                        className="rounded border-slate-300 text-red-600 focus:ring-red-400 h-4 w-4"
                      />
                      <span>Mahngebühr erheben</span>
                    </label>
                    {dunningIncludeFee && (
                      <div className="flex items-center gap-2">
                        <div className="relative max-w-[160px]">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={dunningFee}
                            onChange={(e) => setDunningFee(e.target.value)}
                            className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-red-400"
                          />
                          <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 text-xs font-bold">€</span>
                        </div>
                        <span className="text-slate-400 text-[11px]">wird im E-Mail-Text erwähnt</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Anhang Info */}
              <div className="grid grid-cols-4 gap-4 items-center pt-1">
                <span className="text-slate-500 font-bold uppercase tracking-wider">Anhang</span>
                <div className="col-span-3 flex items-center gap-2 text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 max-w-max">
                  <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="font-bold font-mono text-[11px]">Rechnung-{dunningInvoice.invoiceNumber}.pdf</span>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center gap-3 shrink-0">
              <p className="text-[11px] text-slate-400 font-semibold">Der Versand wird im Aktivitätenprotokoll und Mahnwesen erfasst.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDunningModal(false)}
                  className="px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-black uppercase rounded-xl transition-all shadow-sm"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleSendDunning}
                  disabled={isSendingDunning || !dunningRecipient}
                  className={`px-5 py-2.5 text-white text-xs font-black uppercase rounded-xl transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50 ${
                    dunningType === 'reminder' ? 'bg-blue-600 hover:bg-blue-700' : dunningType === 'first' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isSendingDunning ? (
                    <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                  {isSendingDunning ? 'Wird versendet...' : dunningType === 'reminder' ? 'Erinnerung senden' : dunningType === 'first' ? '1. Mahnung senden' : '2. Mahnung senden'}
                </button>
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

      {/* Payments Modal Dialog */}
      {showPaymentModal && paymentInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Zahlungen</h3>
              <button 
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-all"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6">
              {/* Left Panel: Form */}
              <div className="flex-1 space-y-4">
                {/* Autocomplete payments info banner */}
                <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl flex flex-col gap-1.5 select-none">
                  <h4 className="text-xs font-black text-blue-900 uppercase tracking-wider">Automatischer Zahlungsabgleich</h4>
                  <p className="text-[11px] font-semibold text-blue-700 leading-relaxed">
                    Der automatische Bankkontenabgleich teilt Ihnen mit, welche Transaktionen bereits erledigt sind und welche Vorgänge Ihre Aufmerksamkeit benötigen.{' '}
                    <span className="text-blue-600 hover:text-blue-800 underline cursor-pointer">Bankkonto verknüpfen</span>
                  </p>
                </div>

                {/* Form fields */}
                <div className="space-y-3.5">
                  {/* Datum */}
                  <div className="grid grid-cols-3 gap-4 items-center">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Datum</label>
                    <div className="col-span-2">
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/30"
                      />
                    </div>
                  </div>

                  {/* Zahlung per */}
                  <div className="grid grid-cols-3 gap-4 items-center">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Zahlung per</label>
                    <div className="col-span-2 flex items-center gap-2">
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="Überweisung">Überweisung</option>
                        <option value="PayPal">PayPal</option>
                        <option value="Kreditkarte">Kreditkarte</option>
                        <option value="Lastschrift">Lastschrift</option>
                        <option value="Bar">Bar</option>
                        <option value="Amazon Pay">Amazon Pay</option>
                        <option value="eBay Managed Payments">eBay Managed Payments</option>
                        <option value="Shopify Payments">Shopify Payments</option>
                        <option value="Sonstige">Sonstige</option>
                      </select>
                      <button 
                        onClick={() => {
                          setPaymentMethod('Überweisung');
                          setPaymentProvider('');
                          setPaymentReference('');
                          setPaymentNote('');
                        }}
                        className="p-2 border border-slate-200 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all shadow-sm shrink-0 bg-white"
                        title="Formular zurücksetzen"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Zahlungsdienstleister */}
                  <div className="grid grid-cols-3 gap-4 items-center">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Zahlungsdienstleister</label>
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="z.B. Stripe, PayPal Inc., Sparkasse"
                        value={paymentProvider}
                        onChange={(e) => setPaymentProvider(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Zahlungsreferenz */}
                  <div className="grid grid-cols-3 gap-4 items-center">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Zahlungsreferenz</label>
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="z.B. Transaktions-ID, Verwendungszweck"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Bemerkung */}
                  <div className="grid grid-cols-3 gap-4 items-start">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider pt-2">Bemerkung</label>
                    <div className="col-span-2">
                      <textarea
                        rows={3}
                        placeholder="Interne Notiz zum Zahlungseingang..."
                        value={paymentNote}
                        onChange={(e) => setPaymentNote(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Betrag */}
                  <div className="grid grid-cols-3 gap-4 items-center">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                      <span className="text-rose-500 mr-0.5">*</span>Betrag
                    </label>
                    <div className="col-span-2 flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 text-xs font-bold">€</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const val = (parseFloat(paymentInvoice.totalAmount) * 0.98).toFixed(2);
                          setPaymentAmount(val);
                        }}
                        className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-sm shrink-0 bg-white"
                      >
                        Betrag mit Skonto (2%)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentAmount(paymentInvoice.totalAmount)}
                        className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-sm shrink-0 bg-white"
                      >
                        Vollständiger Betrag
                      </button>
                    </div>
                  </div>

                  {/* Checkboxes */}
                  <div className="grid grid-cols-3 gap-4 pt-1">
                    <div />
                    <div className="col-span-2 space-y-2">
                      <label className="flex items-center gap-2.5 text-xs text-slate-700 font-semibold select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={paymentHasDunningFee}
                          onChange={(e) => setPaymentHasDunningFee(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <span className="flex items-center gap-1">
                          Mahngebühr
                          <span className="text-[10px] bg-slate-100 hover:bg-slate-200 border text-slate-500 rounded-full w-4 h-4 flex items-center justify-center font-bold" title="Wählen Sie dies, wenn die Zahlung eine Verzugsgebühr enthält.">?</span>
                        </span>
                      </label>

                      <label className="flex items-center gap-2.5 text-xs text-slate-700 font-semibold select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={paymentIsSettled}
                          onChange={(e) => setPaymentIsSettled(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <span>Restbetrag = Skonto / Nachlass / vollständig bezahlt</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Panel: Invoice Summary */}
              <div className="w-full md:w-80 bg-slate-50 border border-slate-200/60 rounded-2xl p-5 flex flex-col justify-between shrink-0 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Ausgewählter Beleg</span>
                    <h4 className="text-sm font-black text-slate-900 leading-snug">
                      Rechnung: {paymentInvoice.invoiceNumber}
                    </h4>
                  </div>

                  <div className="w-full h-[1px] bg-slate-200/60" />

                  <div className="space-y-3 text-xs font-semibold text-slate-600">
                    <div className="flex justify-between items-center">
                      <span>Fälligkeit:</span>
                      <span className="text-slate-800 font-bold">
                        {paymentInvoice.dueAt ? format(new Date(paymentInvoice.dueAt), 'dd.MM.yyyy') : '–'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Gesamtbetrag:</span>
                      <span className="text-slate-950 font-black text-sm">
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: paymentInvoice.currency }).format(
                          Number(paymentInvoice.totalAmount)
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white border border-slate-100 rounded-xl flex flex-col gap-1.5 shadow-sm text-center">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Noch zu zahlen</span>
                  <span className="text-2xl font-black text-rose-600 tracking-tight leading-none">
                    {new Intl.NumberFormat('de-DE', { style: 'currency', currency: paymentInvoice.currency }).format(
                      Math.max(0, Number(paymentInvoice.totalAmount) - (parseFloat(paymentAmount) || 0))
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-black uppercase rounded-xl transition-all shadow-sm"
              >
                Abbrechen
              </button>
              
              <button
                type="button"
                onClick={handleSavePayment}
                disabled={isSavingPayment || !paymentAmount}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded-xl transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingPayment ? (
                  <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <span>Speichern und Schließen</span>
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

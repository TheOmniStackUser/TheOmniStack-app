'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { getInvoiceDownloadUrl, getInvoiceDetailsAction, sendInvoiceEmailAction, addInvoiceLogAction } from '@/app/actions/invoices'
import { convertQuoteAction, convertQuoteToOrderAction, deleteQuoteAction, saveQuoteEmailTemplateAction } from '@/app/actions/manual-invoice'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Quote {
  id: string
  invoiceNumber: string
  recipientName: string | null
  recipientCountry: string | null
  totalAmount: string
  currency: string
  createdAt: Date
  pdfStorageKey: string | null
  status: string
  draftName: string | null
}

const formatCountry = (code?: string | null) => {
  if (!code) return 'DE'
  const map: Record<string, string> = {
    'DEU': 'DE', 'AUT': 'AT', 'CHE': 'CH', 'FRA': 'FR',
    'ITA': 'IT', 'ESP': 'ES', 'NLD': 'NL', 'BEL': 'BE',
  }
  return map[code.toUpperCase()] || code.toUpperCase()
}

const formatMarketplaceName = (mp: string | null, shippingCountry?: string | null) => {
  if (!mp || mp.toLowerCase() === 'manual') return 'Manuell'
  const lower = mp.toLowerCase()
  if (lower === 'mirakl_decathlon') {
    if (shippingCountry) {
      const countryCode = formatCountry(shippingCountry)
      return `Decathlon ${countryCode}`
    }
    return 'Decathlon DE'
  }
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
    resolvedName = 'Decathlon DE'
  } else if (lower.includes('decathlon')) {
    const parts = lower.split(' ')
    if (parts.length > 1 && parts[0] === 'decathlon') {
      resolvedName = `Decathlon ${parts[1].toUpperCase()}`
    } else {
      resolvedName = 'Decathlon DE'
    }
  } else {
    resolvedName = mp.charAt(0).toUpperCase() + mp.slice(1)
  }

  if (resolvedName.toLowerCase().startsWith('decathlon') && shippingCountry) {
    const countryCode = formatCountry(shippingCountry)
    if (!resolvedName.toLowerCase().endsWith(` ${countryCode.toLowerCase()}`)) {
      return `Decathlon ${countryCode}`
    }
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
      return { backgroundColor: '#e8f5e9', color: '#1b5e20' }
  }
}

const DEFAULT_QUOTE_TEMPLATE = `Sehr geehrte(r) {Empfänger},

anbei erhalten Sie unser Angebot Nr. {Nummer} vom {Datum} im PDF-Format.
Sie können das Angebot auch unter der folgenden URL abrufen und ohne PDF-Reader anzeigen lassen:
{Link}

Mit freundlichen Grüßen`

export function QuoteList({ 
  initialQuotes,
  company,
  initialEmailTemplate = null,
  currentUserName
}: { 
  initialQuotes: Quote[]
  company?: { email: string; smtpSettings: any }
  initialEmailTemplate?: string | null
  currentUserName: string
}) {
  const router = useRouter()
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [orderingId, setOrderingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  // Detailed Split View state
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null)
  const [details, setDetails] = useState<{ invoice: any, linkedOrder: any } | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [isAddingComment, setIsAddingComment] = useState(false)
  const [isSimulatingSend, setIsSimulatingSend] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'comments' | 'history'>('info')

  // Send Modal States
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendDate, setSendDate] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [ccEmail, setCcEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [messageText, setMessageText] = useState('')
  const [sendAsAttachment, setSendAsAttachment] = useState(true)
  const [emailTemplate, setEmailTemplate] = useState(initialEmailTemplate || DEFAULT_QUOTE_TEMPLATE)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(current => current?.message === message ? null : current)
    }, 5000)
  }

  const handleDownload = async (id: string) => {
    setLoadingId(id)
    try {
      const url = await getInvoiceDownloadUrl(id)
      window.open(url, '_blank')
    } catch {
      showToast('PDF konnte nicht geladen werden.', 'error')
    }
    setLoadingId(null)
  }

  const handleConvertToOrder = async (id: string) => {
    setOrderingId(id)
    try {
      const result = await convertQuoteToOrderAction(id) as any
      if (result?.error) {
        showToast(`Fehler: ${result.error}`, 'error')
        setOrderingId(null)
      }
    } catch (error: any) {
      if (error?.digest?.includes('NEXT_REDIRECT')) return
      showToast('Fehler beim Erstellen der Bestellung.', 'error')
      setOrderingId(null)
    }
  }



  const handleDelete = async (id: string) => {
    if (!confirm('Angebot wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return
    setDeletingId(id)
    try {
      await deleteQuoteAction(id)
      setQuotes(q => q.filter(item => item.id !== id))
      showToast('Angebot gelöscht.', 'success')
      if (selectedQuoteId === id) {
        setSelectedQuoteId(null)
        setDetails(null)
        setPdfUrl(null)
      }
    } catch {
      showToast('Angebot konnte nicht gelöscht werden.', 'error')
    }
    setDeletingId(null)
  }

  const handleSelectQuote = async (quoteId: string) => {
    try {
      setDetailsLoading(true)
      setSelectedQuoteId(quoteId)
      const [detailData, downloadUrl] = await Promise.all([
        getInvoiceDetailsAction(quoteId),
        getInvoiceDownloadUrl(quoteId)
      ])
      setDetails(detailData as any)
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
      setSenderEmail(defaultSender)
      setRecipientEmail(recEmail)
      setCcEmail('')
      setSubject(`Angebot-${invNumber}`)
      setMessageText(resolvedText)
      setSendAsAttachment(true)
    } catch (error) {
      console.error(error)
      showToast(error instanceof Error ? error.message : 'Fehler beim Laden des Angebots.', 'error')
      setSelectedQuoteId(null)
    } finally {
      setDetailsLoading(false)
    }
  }

  const handleSendEmail = async () => {
    if (!selectedQuoteId) return
    try {
      setIsSimulatingSend(true)
      
      const result = await sendInvoiceEmailAction({
        invoiceId: selectedQuoteId,
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

      const updated = await getInvoiceDetailsAction(selectedQuoteId)
      setDetails(updated as any)
      setShowSendModal(false)
      showToast('Angebot wurde erfolgreich versendet.', 'success')
    } catch (error: any) {
      showToast(error.message || 'Fehler beim Versenden des Angebots.', 'error')
    } finally {
      setIsSimulatingSend(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!selectedQuoteId || !details) {
      showToast('Bitte wählen Sie zuerst ein Angebot aus.', 'error')
      return
    }
    try {
      setIsSavingTemplate(true)
      
      const inv = details.invoice
      const invNumber = inv.invoiceNumber || ''
      const invDate = format(new Date(inv.createdAt), 'dd.MM.yyyy', { locale: de })
      const recipientVal = inv.recipientName || 'Kunde'
      
      let templateText = messageText
      
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
      
      const result = await saveQuoteEmailTemplateAction(templateText)
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

  const handleAddComment = async () => {
    if (!selectedQuoteId || !commentText.trim()) return
    try {
      setIsAddingComment(true)
      await addInvoiceLogAction(selectedQuoteId, 'comment', commentText)
      const updated = await getInvoiceDetailsAction(selectedQuoteId)
      setDetails(updated as any)
      setCommentText('')
      showToast('Kommentar gespeichert.', 'success')
    } catch {
      showToast('Kommentar konnte nicht gespeichert werden.', 'error')
    } finally {
      setIsAddingComment(false)
    }
  }

  const filtered = quotes.filter(q => {
    const s = search.toLowerCase()
    return (
      q.invoiceNumber.toLowerCase().includes(s) ||
      (q.recipientName || '').toLowerCase().includes(s)
    )
  })

  return (
    <div>
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-4 min-w-[320px] ${
            toast.type === 'success' ? 'bg-white border-green-100 text-green-800' : 
            toast.type === 'error' ? 'bg-white border-red-100 text-red-800' : 
            'bg-white border-blue-100 text-blue-800'
          }`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              toast.type === 'success' ? 'bg-green-50 text-green-600' : 
              toast.type === 'error' ? 'bg-red-50 text-red-600' : 
              'bg-blue-50 text-blue-600'
            }`}>
              {toast.type === 'success' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>}
              {toast.type === 'error' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>}
              {toast.type === 'info' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm leading-tight">{toast.message}</p>
            </div>
            <button onClick={() => setToast(null)} className="p-1 hover:bg-slate-50 rounded-lg transition-colors text-slate-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-5">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex-1 w-full flex gap-2">
            <div className="relative flex-1 max-w-xs">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Angebot suchen…"
                className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 bg-white text-slate-800 placeholder-slate-400 font-medium"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  title="Suche leeren"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="button"
              className="px-5 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors shadow-sm whitespace-nowrap"
            >
              Suchen
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs tracking-wide uppercase">Ang.-Nr.</th>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs tracking-wide uppercase">Empfänger</th>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs tracking-wide uppercase">Land</th>
              <th className="text-right px-5 py-3.5 font-semibold text-slate-600 text-xs tracking-wide uppercase">Betrag</th>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs tracking-wide uppercase">Erstellt</th>
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs tracking-wide uppercase">Status</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-slate-400">
                  Keine Angebote gefunden.
                </td>
              </tr>
            ) : (
              filtered.map((quote) => {
                const formatCustomerName = (name: string) => {
                  if (name.length <= 20) return name;
                  return name.match(/.{1,20}(\s|$)/g)?.join('\n') || name;
                };
                return (
                  <tr 
                    key={quote.id} 
                    onClick={() => handleSelectQuote(quote.id)}
                    className="hover:bg-slate-50/60 transition-colors group cursor-pointer"
                  >
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs font-semibold text-slate-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                        {quote.invoiceNumber}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-800" style={{ whiteSpace: 'pre-line' }}>
                        {formatCustomerName(quote.recipientName || '–')}
                      </div>
                      {quote.draftName && (
                        <div className="text-xs text-slate-400 mt-0.5">{quote.draftName}</div>
                      )}
                    </td>
                  <td className="px-5 py-4">
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                      {formatCountry(quote.recipientCountry)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="font-semibold text-slate-800">
                      {new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseFloat(quote.totalAmount))} {quote.currency}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {format(new Date(quote.createdAt), 'dd.MM.yyyy', { locale: de })}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                       quote.status === 'issued'
                         ? 'bg-emerald-100 text-emerald-700'
                         : 'bg-amber-100 text-amber-700'
                    }`}>
                      {quote.status === 'issued' ? 'Fertig' : 'Entwurf'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      {/* PDF Download */}
                      {quote.pdfStorageKey && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownload(quote.id); }}
                          disabled={loadingId === quote.id}
                          title="PDF herunterladen"
                          className="p-2 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-all"
                        >
                          {loadingId === quote.id ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          )}
                        </button>
                      )}

                      {/* Convert to Invoice */}
                      <Link
                        href={`/invoices/new?clone=${quote.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title="Als Rechnung erstellen (Formular öffnen)"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        → Rechnung
                      </Link>

                      {/* Convert to Delivery Note */}
                      <Link
                        href={`/delivery-notes/new?clone=${quote.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title="Als Lieferschein erstellen"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        → Lieferschein
                      </Link>

                      {/* Convert to Order */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleConvertToOrder(quote.id); }}
                        disabled={orderingId === quote.id}
                        title="Als Bestellung erstellen"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-all disabled:opacity-50"
                      >
                        {orderingId === quote.id ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                          </svg>
                        )}
                        → Bestellung
                      </button>

                      {/* Delete */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(quote.id); }}
                        disabled={deletingId === quote.id}
                        title="Angebot löschen"
                        className="p-2 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                  </div>
                </td>
              </tr>
            )
          })
        )}
          </tbody>
        </table>
      </div>

      {/* Quote Detail Split View Overlay */}
      {selectedQuoteId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex justify-end">
          {/* Main Container */}
          <div className="flex w-full h-full">
            {/* Left Canvas - PDF Preview */}
            <div 
              className="flex-1 hidden md:flex items-center justify-center p-8 bg-slate-900/10 cursor-pointer"
              onClick={() => {
                setSelectedQuoteId(null)
                setDetails(null)
                setPdfUrl(null)
              }}
            >
              {detailsLoading ? (
                <div className="flex flex-col items-center gap-4 bg-white p-8 rounded-2xl shadow-xl">
                  <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
                  <span className="text-sm font-semibold text-slate-600">Lade Dokumentenvorschau...</span>
                </div>
              ) : pdfUrl ? (
                <div 
                  className="w-full max-w-4xl h-full bg-white rounded-2xl shadow-2xl overflow-hidden border border-white/20 flex flex-col cursor-default"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex justify-between items-center select-none">
                    <span className="text-xs font-bold text-slate-500 tracking-wider flex items-center gap-2 uppercase">
                      <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      PDF-VORSCHAU: {details?.invoice?.invoiceNumber}
                    </span>
                    <button 
                      onClick={() => window.open(pdfUrl, '_blank')}
                      className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1 font-sans"
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
              
              {/* Vertical Icon Strip */}
              <div className="w-16 bg-white border-r border-slate-100 flex flex-col items-center py-4 justify-between select-none shrink-0">
                <div className="flex flex-col gap-6 items-center w-full">
                  {/* Close Cross */}
                  <button 
                    onClick={() => {
                      setSelectedQuoteId(null)
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
                      activeTab === 'info' ? 'bg-amber-50 text-amber-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Informationen"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>

                  {/* Comments Button */}
                  <button 
                    onClick={() => {
                      setActiveTab('comments')
                      document.getElementById('sec-comments')?.scrollIntoView({ behavior: 'smooth' })
                    }}
                    className={`p-2.5 rounded-xl transition-all flex flex-col items-center justify-center relative ${
                      activeTab === 'comments' ? 'bg-amber-50 text-amber-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
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
                      activeTab === 'history' ? 'bg-amber-50 text-amber-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
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
                    <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
                    <span className="text-sm font-semibold text-slate-500">Lade Angebotsdetails...</span>
                  </div>
                ) : details ? (
                  <>
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-xs font-black uppercase text-amber-600 tracking-wider">
                            Angebot
                          </span>
                          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            {details.invoice.invoiceNumber}
                          </h2>
                        </div>
                        <span className="px-2.5 py-1 text-xs font-bold rounded-lg border bg-white shadow-sm flex items-center gap-1.5 font-sans" style={getMarketplaceBadgeStyle(details.linkedOrder?.marketplace || 'manual')}>
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

                      {/* Action Buttons Row */}
                      <div className="mt-5 flex flex-wrap gap-2 font-sans">
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
                        <Link
                          href={`/quotes/new?edit=${details.invoice.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Bearbeiten
                        </Link>

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
                      </div>

                      {/* Convert Actions Row */}
                      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2 font-sans">
                        <span className="w-full text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Aus diesem Angebot generieren</span>
                        {/* → Rechnung erstellen */}
                        <Link
                          href={`/invoices/new?clone=${details.invoice.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-700 transition-all shadow-sm"
                          title="Neue Rechnung auf Basis dieses Angebots erstellen"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          → Rechnung erstellen
                        </Link>

                        {/* → Bestellung erstellen */}
                        <button
                          onClick={() => handleConvertToOrder(details.invoice.id)}
                          disabled={orderingId === details.invoice.id}
                          title="Neue Bestellung auf Basis dieses Angebots erstellen"
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl text-xs font-bold text-violet-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {orderingId === details.invoice.id ? (
                            <>
                              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Wird erstellt...
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                              </svg>
                              → Bestellung erstellen
                            </>
                          )}
                        </button>

                        {/* → Lieferschein erstellen */}
                        <Link
                          href={`/delivery-notes/new?clone=${details.invoice.id}`}
                          title="Neuen Lieferschein auf Basis dieses Angebots erstellen"
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold text-blue-700 transition-all shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                          </svg>
                          → Lieferschein erstellen
                        </Link>
                      </div>
                    </div>


                    {/* Scrollable sections */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-8 ScrollContainer">
                      
                      {/* Section 1: Informationen */}
                      <div id="sec-info" className="space-y-4 pt-2">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Informationen
                        </h3>
                        
                        <div className="bg-slate-50 border border-slate-100 rounded-xl overflow-hidden text-xs font-medium font-sans">
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

                      {/* Section 2: Kommentar hinzufügen */}
                      <div id="sec-comments" className="space-y-4">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                              className="w-full text-xs font-semibold p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all text-slate-900 placeholder:text-slate-400 font-sans"
                              value={commentText}
                              onChange={(e) => setCommentText(e.target.value)}
                            />
                            <button
                              onClick={handleAddComment}
                              disabled={isAddingComment || !commentText.trim()}
                              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-40 font-sans"
                            >
                              {isAddingComment ? 'Speichert...' : 'Speichern'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="h-[1px] bg-slate-100" />

                      {/* Section 3: Aktivitäten */}
                      <div id="sec-history" className="space-y-4 pb-12">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Aktivitäten
                        </h3>
                        
                        {details.invoice.logs && details.invoice.logs.length > 0 ? (
                          <div className="space-y-4">
                            {details.invoice.logs.map((log: any) => {
                              const isComment = log.action === 'comment'
                              const isEmail = log.action === 'email'
                              
                              return (
                                <div key={log.id} className="relative pl-6 border-l border-slate-100 last:border-0 pb-1">
                                  <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${
                                    isComment ? 'bg-amber-400' : isEmail ? 'bg-blue-400' : 'bg-slate-400'
                                  }`} />
                                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-sans">
                                    {format(new Date(log.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })} • {log.user?.name || 'System'}
                                  </div>
                                  <div className="text-xs text-slate-700 mt-1 whitespace-pre-line font-medium leading-relaxed font-sans">
                                    {log.note}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Bisher keine Aktivitäten vorhanden.</p>
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

      {/* Send Document Modal */}
      {showSendModal && details && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Angebot versenden</h3>
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
              <div className="bg-amber-50/60 text-amber-900 border border-amber-100 rounded-xl p-4 leading-relaxed font-medium">
                Bitte vergewissern Sie sich vor dem Versand per E-Mail, dass die beim Kunden hinterlegte E-Mail-Adresse korrekt erfasst ist.
              </div>

              {/* Form Grid */}
              <div className="space-y-4">
                
                {/* Datum */}
                <div className="grid grid-cols-4 gap-4 items-center">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Datum</span>
                  <div className="col-span-3">
                    <input 
                      type="text" 
                      className="w-full max-w-xs px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                      value={sendDate}
                      onChange={(e) => setSendDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Versandart */}
                <div className="grid grid-cols-4 gap-4 items-center">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Versandart</span>
                  <div className="col-span-3 flex gap-2">
                    <button className="border border-amber-500 bg-amber-50 text-amber-700 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm">
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
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
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
                      className="text-amber-600 hover:text-amber-700 hover:underline shrink-0 text-sm font-semibold"
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
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-800"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="empfaenger@email.de"
                    />
                  </div>
                </div>

                {/* Weitere Empfänger */}
                <div className="grid grid-cols-4 gap-4 items-center">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Weitere Empfänger</span>
                  <div className="col-span-3 flex gap-2">
                    <input 
                      type="text" 
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-800"
                      value={ccEmail}
                      onChange={(e) => setCcEmail(e.target.value)}
                      placeholder="weitere-empfaenger@email.de"
                    />
                  </div>
                </div>

                {/* Betreff */}
                <div className="grid grid-cols-4 gap-4 items-center">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Betreff</span>
                  <div className="col-span-3">
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-800"
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
                      className="text-amber-600 hover:text-amber-700 hover:underline text-left mt-1 text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSavingTemplate ? 'Speichert...' : 'Standardtext ändern'}
                    </button>
                  </div>
                  <div className="col-span-3">
                    <textarea 
                      rows={6}
                      className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 leading-relaxed font-medium font-sans text-xs text-slate-800"
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
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4" 
                        checked={sendAsAttachment}
                        onChange={(e) => setSendAsAttachment(e.target.checked)}
                      />
                      <span>Angebot als PDF-Anhang mitsenden</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 font-sans">
              <button 
                onClick={() => setShowSendModal(false)}
                className="px-5 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-all text-xs"
              >
                Abbrechen
              </button>
              <button 
                onClick={handleSendEmail}
                disabled={isSimulatingSend || !recipientEmail}
                className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg text-xs disabled:opacity-40 flex items-center gap-2"
              >
                {isSimulatingSend ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Wird versendet...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Senden
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import React, { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import {
  MessageSquareText,
  Search,
  Filter,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Send,
  Plus,
  ExternalLink,
  User,
  Package,
  ShoppingCart,
  Sparkles,
  X,
  AlertCircle,
  HelpCircle,
  ArrowUpDown,
  Mail,
  Server,
  Copy,
  Check,
  Settings,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react'
import {
  getQuestionsAction,
  answerQuestionAction,
  updateQuestionStatusAction,
  syncMarketplaceQuestionsAction,
  createManualQuestionAction,
  getQuestionDetailsAction,
  type ManualQuestionInput
} from '@/app/actions/questions'

interface QuestionItem {
  id: string
  companyId: string
  marketplace: string
  externalQuestionId: string
  status: 'open' | 'in_progress' | 'answered' | 'closed'
  questionType: 'product' | 'order' | 'general'
  customerName: string
  customerEmail: string | null
  productSku: string | null
  productTitle: string | null
  marketplaceProductId: string | null
  marketplaceOrderId: string | null
  orderId: string | null
  subject: string
  questionText: string
  deadlineAt: Date | string | null
  slaHours: number
  lastAnswerText: string | null
  answeredAt: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string
  sla: {
    isOverdue: boolean
    remainingMs: number
    remainingHours: number
    remainingMinutes: number
    severity: 'safe' | 'warning' | 'urgent' | 'overdue' | 'resolved'
    label: string
    formattedDeadline: string
  }
}

interface ThreadMessage {
  id: string
  questionId: string
  senderType: 'customer' | 'seller' | 'system'
  senderName: string
  senderEmail: string | null
  messageText: string
  status: string
  createdAt: Date | string
}

interface SetupConfig {
  companyId: string
  companyEmail: string | null
  smtpEnabled: boolean
  smtpFromEmail: string | null
  smtpHost: string | null
  ottoConnected: boolean
}

interface QuestionsClientProps {
  initialQuestions: QuestionItem[]
  activeMarketplaces: { id: string; name: string }[]
  setupConfig?: SetupConfig
}

const QUICK_TEMPLATES = [
  {
    title: 'Sendungsverfolgung übermitteln',
    text: 'Guten Tag,\n\nvielen Dank für Ihre Anfrage. Ihre Sendung wurde bereits an unseren Versanddienstleister übergeben. Sie können den aktuellen Zustellstatus über die in der Versandbestätigung hinterlegte Trackingnummer verfolgen.\n\nBei weiteren Fragen stehen wir Ihnen gerne zur Verfügung.'
  },
  {
    title: 'Produktdetails & Maße',
    text: 'Guten Tag,\n\nvielen Dank für Ihr Interesse an unserem Produkt. Zu Ihrer Frage: Der Artikel entspricht den angegebenen Abmessungen und Spezifikationen. Weitere Detailinformationen entnehmen Sie bitte der Produktbeschreibung auf der Artikelseite.\n\nWir hoffen, dies hilft Ihnen weiter!'
  },
  {
    title: 'Rücksendung & Retoure',
    text: 'Guten Tag,\n\nSie können den Artikel selbstverständlich innerhalb der Widerrufsfrist kostenfrei an uns zurücksenden. Bitte nutzen Sie hierfür das offizielle Retouren-Etikett aus Ihrem OTTO-Kundenkonto.\n\nSobald die Ware in unserem Lager eintrifft und geprüft wurde, veranlassen wir umgehend die Erstattung.'
  },
  {
    title: 'Kulanz / Teilerstattung anbieten',
    text: 'Guten Tag,\n\nes tut uns sehr leid, dass der gelieferte Artikel nicht Ihren Erwartungen entspricht. Um Ihnen eine Rücksendung zu ersparen, bieten wir Ihnen gerne einen Preisnachlass von 15 % auf diesen Artikel an. Bitte geben Sie uns kurz Bescheid, ob dieser Lösungsvorschlag für Sie in Ordnung ist.'
  }
]

export function QuestionsClient({
  initialQuestions,
  activeMarketplaces,
  setupConfig
}: QuestionsClientProps) {
  const [questions, setQuestions] = useState<QuestionItem[]>(initialQuestions)
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    initialQuestions[0]?.id || null
  )
  const [selectedQuestionDetails, setSelectedQuestionDetails] = useState<any | null>(null)
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([])
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false)

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'urgent' | 'answered' | 'closed'>('all')
  const [sortOrder, setSortOrder] = useState<'deadline' | 'newest' | 'oldest'>('deadline')

  // Answer composer state
  const [answerText, setAnswerText] = useState('')
  const [isAnswering, startAnswering] = useTransition()
  const [isSyncing, startSyncing] = useTransition()

  // Modal & Setup Guide States
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(
    initialQuestions.length === 0 || !setupConfig?.smtpEnabled
  )
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [modalForm, setModalForm] = useState<ManualQuestionInput>({
    marketplace: 'otto',
    customerName: '',
    customerEmail: '',
    subject: '',
    questionText: '',
    questionType: 'order',
    productSku: '',
    productTitle: '',
    marketplaceOrderId: '',
    slaHours: 48
  })
  const [modalError, setModalError] = useState<string | null>(null)
  const [isSubmittingModal, startSubmittingModal] = useTransition()

  // Status notification banners
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  // Load question thread details when selection changes
  React.useEffect(() => {
    if (!selectedQuestionId) {
      setSelectedQuestionDetails(null)
      setThreadMessages([])
      return
    }

    setLoadingDetails(true)
    getQuestionDetailsAction(selectedQuestionId)
      .then((data) => {
        setSelectedQuestionDetails(data)
        setThreadMessages(data.messages || [])
      })
      .catch((err) => {
        console.error('Error loading question details:', err)
      })
      .finally(() => setLoadingDetails(false))
  }, [selectedQuestionId])

  // Counts for tabs & summary
  const counts = useMemo(() => {
    const openCount = questions.filter((q) => q.status === 'open').length
    const inProgressCount = questions.filter((q) => q.status === 'in_progress').length
    const urgentCount = questions.filter(
      (q) => q.status === 'open' && (q.sla.severity === 'urgent' || q.sla.severity === 'overdue')
    ).length
    const answeredCount = questions.filter((q) => q.status === 'answered' || q.status === 'closed').length
    const closedCount = questions.filter((q) => q.status === 'closed').length
    return {
      all: questions.length,
      open: openCount,
      inProgress: inProgressCount,
      urgent: urgentCount,
      answered: answeredCount,
      closed: closedCount
    }
  }, [questions])

  // Filter & Sort questions
  const filteredQuestions = useMemo(() => {
    return questions
      .filter((q) => {
        // Marketplace filter
        if (selectedMarketplace !== 'all' && q.marketplace.toLowerCase() !== selectedMarketplace.toLowerCase()) {
          return false
        }
        // Status filter
        if (statusFilter === 'open' && q.status !== 'open') return false
        if (statusFilter === 'in_progress' && q.status !== 'in_progress') return false
        if (statusFilter === 'urgent') {
          if (q.status !== 'open') return false
          if (q.sla.severity !== 'urgent' && q.sla.severity !== 'overdue') return false
        }
        if (statusFilter === 'answered' && q.status !== 'answered' && q.status !== 'closed') return false
        if (statusFilter === 'closed' && q.status !== 'closed') return false

        // Search Query
        if (searchQuery.trim()) {
          const lower = searchQuery.toLowerCase()
          const matchCustomer = q.customerName.toLowerCase().includes(lower)
          const matchSubject = q.subject.toLowerCase().includes(lower)
          const matchText = q.questionText.toLowerCase().includes(lower)
          const matchSku = q.productSku?.toLowerCase().includes(lower)
          const matchOrder = q.marketplaceOrderId?.toLowerCase().includes(lower)
          const matchExtId = q.externalQuestionId.toLowerCase().includes(lower)
          if (!matchCustomer && !matchSubject && !matchText && !matchSku && !matchOrder && !matchExtId) {
            return false
          }
        }
        return true
      })
      .sort((a, b) => {
        if (sortOrder === 'deadline') {
          // Open questions first, ordered by deadline ascending (most urgent first)
          if (a.status === 'open' && b.status !== 'open') return -1
          if (a.status !== 'open' && b.status === 'open') return 1
          const timeA = a.deadlineAt ? new Date(a.deadlineAt).getTime() : Infinity
          const timeB = b.deadlineAt ? new Date(b.deadlineAt).getTime() : Infinity
          return timeA - timeB
        }
        if (sortOrder === 'oldest') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        }
        // Default: newest first
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  }, [questions, selectedMarketplace, statusFilter, searchQuery, sortOrder])

  // Current active selected question object
  const activeQuestion = useMemo(() => {
    return questions.find((q) => q.id === selectedQuestionId) || null
  }, [questions, selectedQuestionId])

  // Handle Send Answer
  const handleSendAnswer = () => {
    if (!selectedQuestionId || !answerText.trim()) return

    startAnswering(async () => {
      try {
        const res = await answerQuestionAction(selectedQuestionId, answerText)
        if (res.success) {
          showNotification('success', 'Antwort erfolgreich versendet und Frage aktualisiert!')
          setAnswerText('')
          // Update local question state
          setQuestions((prev) =>
            prev.map((q) =>
              q.id === selectedQuestionId
                ? {
                    ...q,
                    status: 'answered',
                    lastAnswerText: answerText.trim(),
                    answeredAt: new Date().toISOString(),
                    sla: {
                      ...q.sla,
                      isOverdue: false,
                      severity: 'resolved',
                      label: 'Beantwortet'
                    }
                  }
                : q
            )
          )
          // Add to thread
          setThreadMessages((prev) => [
            ...prev,
            {
              id: `msg-${Date.now()}`,
              questionId: selectedQuestionId,
              senderType: 'seller',
              senderName: 'Kundenservice',
              senderEmail: null,
              messageText: answerText.trim(),
              status: 'sent',
              createdAt: new Date().toISOString()
            }
          ])
        } else {
          showNotification('error', res.error || 'Fehler beim Versenden der Antwort.')
        }
      } catch (err: any) {
        showNotification('error', err.message || 'Unerwarteter Fehler beim Versenden.')
      }
    })
  }

  // Handle Status Update
  const handleUpdateStatus = (newStatus: 'open' | 'in_progress' | 'answered' | 'closed') => {
    if (!selectedQuestionId) return

    updateQuestionStatusAction(selectedQuestionId, newStatus)
      .then((res) => {
        if (res.success) {
          const statusLabel =
            newStatus === 'in_progress'
              ? 'In Bearbeitung'
              : newStatus === 'answered'
              ? 'Beantwortet'
              : newStatus === 'closed'
              ? 'Geschlossen'
              : 'Offen'
          showNotification('success', `Status auf "${statusLabel}" gesetzt.`)
          setQuestions((prev) =>
            prev.map((q) =>
              q.id === selectedQuestionId
                ? {
                    ...q,
                    status: newStatus,
                    sla: {
                      ...q.sla,
                      severity:
                        newStatus === 'in_progress'
                          ? 'safe'
                          : newStatus === 'open'
                          ? 'warning'
                          : 'resolved',
                      label:
                        newStatus === 'in_progress'
                          ? 'In Bearbeitung'
                          : newStatus === 'open'
                          ? 'Wiedereröffnet'
                          : newStatus === 'answered'
                          ? 'Beantwortet'
                          : 'Geschlossen'
                    }
                  }
                : q
            )
          )
        }
      })
      .catch((err) => showNotification('error', err.message))
  }

  // Handle Sync
  const handleSync = () => {
    startSyncing(async () => {
      try {
        const res = await syncMarketplaceQuestionsAction()
        if (res.success) {
          // Immediately fetch the updated questions from database into state
          const updated = await getQuestionsAction({
            marketplace: selectedMarketplace,
            status: statusFilter,
            search: searchQuery,
            sort: sortOrder,
          })
          setQuestions(updated)
          showNotification(
            'success',
            res.count > 0
              ? `Synchronisation erfolgreich: ${res.count} neue Kundenanfrage(n) importiert.`
              : 'Synchronisation abgeschlossen. Alle Anfragen sind auf dem neuesten Stand.'
          )
        } else {
          showNotification('error', 'Fehler beim Synchronisieren.')
        }
      } catch (err: any) {
        showNotification('error', err.message || 'Sync fehlgeschlagen.')
      }
    })
  }

  // Copy helper for setup guide
  const handleCopyText = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(fieldKey)
    setTimeout(() => setCopiedField(null), 2500)
  }

  const handleCreateManualQuestion = (e: React.FormEvent) => {
    e.preventDefault()
    setModalError(null)

    if (!modalForm.customerName || !modalForm.subject || !modalForm.questionText) {
      setModalError('Bitte Name, Betreff und Nachrichtentext ausfüllen.')
      return
    }

    startSubmittingModal(async () => {
      try {
        const res = await createManualQuestionAction(modalForm)
        if (res.success && res.questionId) {
          showNotification('success', 'Frage erfolgreich erfasst!')
          setIsModalOpen(false)
          const newQuestionId = res.questionId
          // Add mock to list directly
          const newQ: QuestionItem = {
            id: newQuestionId,
            companyId: 'current',
            marketplace: modalForm.marketplace,
            externalQuestionId: `Q-${modalForm.marketplace.toUpperCase()}-${Date.now().toString().slice(-6)}`,
            status: 'open',
            questionType: modalForm.questionType || 'general',
            customerName: modalForm.customerName,
            customerEmail: modalForm.customerEmail || null,
            productSku: modalForm.productSku || null,
            productTitle: modalForm.productTitle || null,
            marketplaceProductId: null,
            marketplaceOrderId: modalForm.marketplaceOrderId || null,
            orderId: null,
            subject: modalForm.subject,
            questionText: modalForm.questionText,
            deadlineAt: new Date(Date.now() + (modalForm.slaHours || 48) * 3600 * 1000).toISOString(),
            slaHours: modalForm.slaHours || 48,
            lastAnswerText: null,
            answeredAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sla: {
              isOverdue: false,
              remainingMs: (modalForm.slaHours || 48) * 3600 * 1000,
              remainingHours: modalForm.slaHours || 48,
              remainingMinutes: 0,
              severity: 'safe',
              label: `noch ${modalForm.slaHours || 48}h`,
              formattedDeadline: new Date(Date.now() + (modalForm.slaHours || 48) * 3600 * 1000).toLocaleString('de-DE')
            }
          }
          setQuestions((prev) => [newQ, ...prev])
          setSelectedQuestionId(newQuestionId)
        } else {
          setModalError(res.error || 'Fehler beim Anlegen der Frage.')
        }
      } catch (err: any) {
        setModalError(err.message || 'Fehler beim Anlegen.')
      }
    })
  }

  // SLA Badge style helper
  const renderSlaBadge = (sla: QuestionItem['sla']) => {
    if (sla.label === 'In Bearbeitung') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
          <Clock size={12} className="text-blue-600" />
          In Bearbeitung
        </span>
      )
    }
    if (sla.severity === 'overdue') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-sm animate-pulse">
          <AlertTriangle size={12} className="text-rose-600" />
          {sla.label}
        </span>
      )
    }
    if (sla.severity === 'urgent') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-sm animate-pulse">
          <Clock size={12} className="text-amber-700" />
          {sla.label}
        </span>
      )
    }
    if (sla.severity === 'warning') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
          <Clock size={12} className="text-amber-600" />
          {sla.label}
        </span>
      )
    }
    if (sla.severity === 'resolved') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
          <CheckCircle2 size={12} className="text-slate-500" />
          {sla.label}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
        <Clock size={12} className="text-emerald-600" />
        {sla.label}
      </span>
    )
  }

  // Marketplace badge styling helper
  const renderMarketplaceBadge = (market: string) => {
    const m = market.toLowerCase()
    if (m === 'otto') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-red-50 text-red-700 border border-red-200">
          OTTO
        </span>
      )
    }
    if (m === 'amazon') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
          Amazon
        </span>
      )
    }
    if (m === 'kaufland') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
          Kaufland
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
        {market.toUpperCase()}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {notification && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between shadow-lg transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-3">
            {notification.type === 'success' ? (
              <CheckCircle2 size={20} className="text-emerald-600" />
            ) : (
              <AlertCircle size={20} className="text-rose-600" />
            )}
            <p className="text-sm font-semibold">{notification.message}</p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="p-1 rounded-md hover:bg-black/5 text-slate-500"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-600">
              <MessageSquareText size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Kundenanfragen & Nachrichten
                </h1>
                <button
                  type="button"
                  onClick={() => setShowHelpModal(true)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 hover:bg-cyan-100 text-slate-500 hover:text-cyan-700 transition-colors cursor-pointer border border-slate-200 hover:border-cyan-300 shadow-sm"
                  title="Hilfe & Marktplatz-Informationen öffnen"
                >
                  <HelpCircle size={16} />
                </button>
              </div>
              <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                <p className="text-sm text-slate-500">
                  Marktplatz-Anfragen einsehen, Fristen überwachen und direkt beantworten.
                </p>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  Derzeit aktiv: Exklusiv für OTTO Market (weitere Marktplätze folgen)
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowSetupGuide((prev) => !prev)}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold shadow-sm transition-all cursor-pointer ${
              setupConfig?.smtpEnabled
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
            }`}
          >
            <Settings size={15} className={setupConfig?.smtpEnabled ? 'text-emerald-600' : 'text-amber-600'} />
            <span>Einrichtung & Anleitung</span>
            {showSetupGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
            title="Fragen aktualisieren"
          >
            <RefreshCw size={16} className={isSyncing ? 'animate-spin text-cyan-600' : 'text-slate-500'} />
            <span>{isSyncing ? 'Synchronisiere...' : 'Aktualisieren'}</span>
          </button>

          <button
            onClick={() => {
              setModalError(null)
              setIsModalOpen(true)
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold shadow-md shadow-cyan-600/20 transition-all"
          >
            <Plus size={18} />
            <span>Anfrage manuell erfassen</span>
          </button>
        </div>
      </div>

      {/* Collapsible Dealer Setup & Configuration Guide */}
      {showSetupGuide && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 flex-shrink-0 mt-0.5">
                <Info size={20} />
              </div>
              <div>
                <h3 className="text-base font-extrabold tracking-tight text-white">
                  So richtest du die OTTO-Kundenanfragen ein (Wichtiger Hinweis für Händler)
                </h3>
                <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                  <strong>Warum ist eine E-Mail-Einrichtung erforderlich?</strong> OTTO Partner Connect bietet für Kundenanfragen (<em>Klärfälle / Nachrichtenverlauf</em>) <strong>keine öffentliche REST-API</strong> an (anders als für Bestellungen oder Retouren). Stattdessen versendet und empfängt OTTO alle Kundenanfragen ausschließlich über das offizielle <strong>OTTO E-Mail-Gateway (<code className="text-cyan-300 font-mono">*@customer.otto.market</code>)</strong>.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSetupGuide(false)}
              className="self-end sm:self-center px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-slate-200 transition-colors flex-shrink-0 cursor-pointer"
            >
              Ausblenden
            </button>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5 bg-slate-50/50">
            {/* Step 1: OTTO Portal */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-800 border border-cyan-200 text-xs font-extrabold">
                    Schritt 1: Im OTTO-Portal (OPC)
                  </span>
                  <Mail size={18} className="text-slate-400" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Kundenservice-E-Mail bei OTTO hinterlegen
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                   Öffne das <strong>OTTO Partner Connect Portal</strong> und navigiere zu <em>Einstellungen → Unternehmensdaten / Ansprechpartner</em>.
                </p>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                  <li>Hinterlege dort deine offizielle <strong>Kundenservice-E-Mail-Adresse</strong> (z.&nbsp;B. <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-800">service@dein-shop.de</code>).</li>
                  <li>Aktiviere die Option, dass OTTO neue Kundenanfragen und Antworten per E-Mail an diese Adresse weiterleitet.</li>
                </ul>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Hinterlegte Firmen-E-Mail:</span>
                <span className="font-mono font-bold text-slate-800">
                  {setupConfig?.companyEmail || 'Nicht hinterlegt'}
                </span>
              </div>
            </div>

            {/* Step 2: Incoming Messages (Webhook / Forwarding) */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-800 border border-cyan-200 text-xs font-extrabold">
                    Schritt 2: Eingehende Anfragen
                  </span>
                  <Server size={18} className="text-slate-400" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  E-Mail-Weiterleitung an Webhook einrichten
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Damit eingehende E-Mails von <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-800">*@customer.otto.market</code> mit dem <strong>echten Nachrichtentext</strong> automatisch hier erscheinen, leite sie (z.&nbsp;B. über Make, Zapier, Cloudflare Email Routing oder Mailgun/SendGrid Inbound Parse) per <code className="font-mono">POST</code> an diesen Endpunkt weiter:
                </p>

                <div className="p-2.5 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] flex items-center justify-between gap-2">
                  <span className="truncate">/api/webhooks/marketplace-questions</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(
                        `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/marketplace-questions`,
                        'webhook-url'
                      )
                    }
                    className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-sans font-bold flex items-center gap-1 flex-shrink-0 cursor-pointer"
                  >
                    {copiedField === 'webhook-url' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>{copiedField === 'webhook-url' ? 'Kopiert' : 'URL kopieren'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Die OTTO-Bestellnummer (z.&nbsp;B. <code className="font-mono text-slate-700">cbn4zxk3qr</code>) und Klärfall-ID (<code className="font-mono text-slate-700">#24821074</code>) werden automatisch aus Betreff/Text erkannt und mit der Bestellung verknüpft. Alternativ kannst du Nachrichten über <strong>„Anfrage manuell erfassen“</strong> eintragen.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">JSON-Felder:</span>
                <code className="font-mono text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  from, to, subject, text
                </code>
              </div>
            </div>

            {/* Step 3: Outgoing SMTP */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-800 border border-cyan-200 text-xs font-extrabold">
                    Schritt 3: Ausgehende Antworten (SMTP)
                  </span>
                  {setupConfig?.smtpEnabled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 size={12} className="text-emerald-600" />
                      Aktiv
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      <AlertTriangle size={12} className="text-amber-600" />
                      Erforderlich
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Eigenen SMTP-Server für Antworten verbinden
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>Wichtig:</strong> Das OTTO-Gateway (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-800">@customer.otto.market</code>) akzeptiert Antworten <strong>nur dann</strong>, wenn sie von exakt derselben Absender-Adresse verschickt werden, die im OTTO-Portal hinterlegt ist.
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Aktiviere daher unter <strong>Einstellungen → E-Mail-Versand (SMTP)</strong> deinen eigenen Mailserver mit genau dieser Absender-E-Mail.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="text-xs truncate">
                  {setupConfig?.smtpEnabled ? (
                    <span className="text-emerald-700 font-semibold">
                      SMTP aktiv ({setupConfig.smtpFromEmail || setupConfig.smtpHost})
                    </span>
                  ) : (
                    <span className="text-amber-800 font-semibold">
                      Noch kein eigener SMTP-Server aktiv
                    </span>
                  )}
                </div>
                <Link
                  href="/settings#smtp-settings"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all flex-shrink-0"
                >
                  <Settings size={13} />
                  <span>Zu den SMTP-Einstellungen</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div
          onClick={() => setStatusFilter('all')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-white border-cyan-500 shadow-md ring-2 ring-cyan-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Alle Anfragen</span>
            <MessageSquareText size={18} className="text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{counts.all}</span>
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('open')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'open'
              ? 'bg-white border-cyan-500 shadow-md ring-2 ring-cyan-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-700 uppercase tracking-wider">Neue Anfragen</span>
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{counts.open}</span>
            <span className="text-xs font-medium text-slate-500">neu</span>
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('in_progress')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'in_progress'
              ? 'bg-white border-blue-500 shadow-md ring-2 ring-blue-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">In Bearbeitung</span>
            <Clock size={18} className="text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{counts.inProgress}</span>
            <span className="text-xs font-medium text-slate-500">laufend</span>
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('urgent')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'urgent'
              ? 'bg-white border-rose-500 shadow-md ring-2 ring-rose-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Frist droht (SLA)</span>
            <AlertTriangle size={18} className="text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold ${counts.urgent > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {counts.urgent}
            </span>
            <span className="text-xs font-medium text-slate-500">&lt; 24h verbleibend</span>
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('answered')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'answered'
              ? 'bg-white border-cyan-500 shadow-md ring-2 ring-cyan-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Beantwortet</span>
            <CheckCircle2 size={18} className="text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{counts.answered}</span>
            <span className="text-xs font-medium text-slate-500">erledigt</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          {/* Search Input (Strict high contrast text-slate-900, placeholder:text-slate-500) */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Suchen nach Kunde, Betreff, SKU, OTTO-Bestellnummer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Marketplace Selector */}
          <div className="sm:w-52">
            <select
              value={selectedMarketplace}
              onChange={(e) => setSelectedMarketplace(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="all">Alle Marktplätze (aktuell: OTTO)</option>
              {activeMarketplaces.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.id.toLowerCase() !== 'otto' ? '(in Kürze)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Selector */}
          <div className="sm:w-56">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="deadline">Dringendste Frist zuerst (SLA)</option>
              <option value="newest">Neueste Anfragen zuerst</option>
              <option value="oldest">Älteste Anfragen zuerst</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Split-View Inbox */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[680px]">
        {/* Left Column: Questions List (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden max-h-[820px]">
          <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Nachrichten ({filteredQuestions.length})
              </span>
            </div>
            {sortOrder === 'deadline' && (
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                Nach SLA sortiert
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredQuestions.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <MessageSquareText size={24} />
                </div>
                <h4 className="text-sm font-bold text-slate-800">Keine Anfragen gefunden</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  {searchQuery || statusFilter !== 'all' || selectedMarketplace !== 'all'
                    ? 'Versuche deine Filter zurückzusetzen.'
                    : 'Sobald neue Kundenanfragen per E-Mail-Weiterleitung (Webhook) eingehen oder manuell erfasst werden, erscheinen sie hier.'}
                </p>
                <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowSetupGuide(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 text-xs font-semibold cursor-pointer"
                  >
                    <Settings size={14} />
                    <span>Einrichtung prüfen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Anfrage manuell erfassen</span>
                  </button>
                </div>
              </div>
            ) : (
              filteredQuestions.map((q) => {
                const isSelected = q.id === selectedQuestionId
                return (
                  <div
                    key={q.id}
                    onClick={() => setSelectedQuestionId(q.id)}
                    className={`p-4 transition-all cursor-pointer border-l-4 ${
                      isSelected
                        ? 'bg-cyan-50/40 border-l-cyan-500 shadow-sm'
                        : 'border-l-transparent hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {renderMarketplaceBadge(q.marketplace)}
                        <span className="text-xs font-semibold text-slate-500 uppercase">
                          {q.questionType === 'product'
                            ? 'Produkt'
                            : q.questionType === 'order'
                            ? 'Bestellung'
                            : 'Allgemein'}
                        </span>
                      </div>
                      {/* SLA Live Badge */}
                      {renderSlaBadge(q.sla)}
                    </div>

                    <div className="mt-2.5">
                      <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{q.subject}</h4>
                      <p className="text-xs text-slate-600 line-clamp-2 mt-1 leading-relaxed">
                        {q.questionText}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                      <div className="flex items-center gap-2 font-medium text-slate-600">
                        <User size={13} className="text-slate-400" />
                        <span className="truncate max-w-[130px]">{q.customerName}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {q.productSku && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[10px] text-slate-700">
                            {q.productSku}
                          </span>
                        )}
                        {q.marketplaceOrderId && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[10px] text-slate-700">
                            #{q.marketplaceOrderId}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Column: Conversation Detail & Answer Composer (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden max-h-[820px]">
          {activeQuestion ? (
            <>
              {/* Prominent SLA Penalty Countdown Banner */}
              {activeQuestion.status === 'open' && (
                <div
                  className={`p-3.5 px-6 border-b flex items-center justify-between transition-colors ${
                    activeQuestion.sla.severity === 'overdue'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : activeQuestion.sla.severity === 'urgent'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {activeQuestion.sla.severity === 'overdue' ? (
                      <AlertTriangle size={18} className="text-rose-600 animate-bounce" />
                    ) : (
                      <Clock size={18} className="text-amber-600" />
                    )}
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider block">
                        {activeQuestion.sla.severity === 'overdue'
                          ? 'SLA Frist überschritten!'
                          : 'Marktplatz-Reaktionsfrist (SLA)'}
                      </span>
                      <span className="text-sm font-semibold">
                        {activeQuestion.sla.label} &bull; Deadline:{' '}
                        {activeQuestion.sla.formattedDeadline || 'Keine Frist'}
                      </span>
                    </div>
                  </div>

                  <span className="text-[11px] font-medium opacity-80 hidden sm:inline">
                    OTTO-Vorgabe: 48h an Werktagen
                  </span>
                </div>
              )}

              {activeQuestion.status === 'in_progress' && (
                <div className="p-3.5 px-6 border-b bg-blue-50/70 border-blue-200 text-blue-900 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Clock size={18} className="text-blue-600" />
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider block text-blue-800">
                        In Bearbeitung
                      </span>
                      <span className="text-xs font-medium text-blue-950">
                        Diese Anfrage befindet sich aktuell in Abstimmung mit OTTO / Kunde.
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-blue-700 px-2.5 py-1 rounded-full bg-blue-100 border border-blue-200 hidden sm:inline">
                    Keine Friststrafe aktiv
                  </span>
                </div>
              )}

              {/* Conversation Header */}
              <div className="p-5 border-b border-slate-100 bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      {renderMarketplaceBadge(activeQuestion.marketplace)}
                      <h3 className="text-lg font-bold text-slate-900">{activeQuestion.subject}</h3>
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                      <span>Von: <strong className="text-slate-800">{activeQuestion.customerName}</strong></span>
                      {activeQuestion.customerEmail && (
                        <span className="font-mono text-slate-400">({activeQuestion.customerEmail})</span>
                      )}
                      <span>&bull;</span>
                      <span>
                        Eingegangen: {new Date(activeQuestion.createdAt).toLocaleString('de-DE')}
                      </span>
                    </p>
                  </div>

                  {/* Status Toggle Actions */}
                  <div className="flex items-center gap-2">
                    {activeQuestion.status === 'open' ? (
                      <>
                        <button
                          onClick={() => handleUpdateStatus('in_progress')}
                          className="px-3 py-1.5 rounded-xl border border-blue-200 hover:bg-blue-50 text-blue-700 text-xs font-semibold shadow-sm transition-all"
                        >
                          In Bearbeitung
                        </button>
                        <button
                          onClick={() => handleUpdateStatus('answered')}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all"
                        >
                          Als erledigt markieren
                        </button>
                      </>
                    ) : activeQuestion.status === 'in_progress' ? (
                      <>
                        <button
                          onClick={() => handleUpdateStatus('answered')}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all"
                        >
                          Als erledigt markieren
                        </button>
                        <button
                          onClick={() => handleUpdateStatus('open')}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all"
                        >
                          Als neu markieren
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus('open')}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all"
                      >
                        Wiedereröffnen
                      </button>
                    )}
                  </div>
                </div>

                {/* Contextual Chips (Linked Order / SKU) */}
                <div className="mt-3.5 flex items-center gap-2 flex-wrap">
                  {selectedQuestionDetails?.linkedOrder ? (
                    <Link
                      href={`/orders/${selectedQuestionDetails.linkedOrder.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 text-xs font-bold border border-cyan-200 transition-all"
                    >
                      <ShoppingCart size={13} />
                      <span>Bestellung #{selectedQuestionDetails.linkedOrder.orderNumber}</span>
                      <ExternalLink size={12} className="opacity-60 ml-0.5" />
                    </Link>
                  ) : activeQuestion.marketplaceOrderId ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium">
                      <ShoppingCart size={13} />
                      <span>OTTO-Bestellung: {activeQuestion.marketplaceOrderId}</span>
                    </span>
                  ) : null}

                  {activeQuestion.productSku && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium">
                      <Package size={13} />
                      <span>SKU: {activeQuestion.productSku}</span>
                      {activeQuestion.productTitle && (
                        <span className="text-slate-500 font-normal truncate max-w-[200px]">
                          ({activeQuestion.productTitle})
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Message History Thread */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/40">
                {loadingDetails ? (
                  <div className="py-12 text-center text-slate-400">
                    <RefreshCw size={24} className="animate-spin mx-auto text-cyan-600 mb-2" />
                    <span className="text-xs">Nachrichtenverlauf wird geladen...</span>
                  </div>
                ) : (
                  threadMessages.map((msg) => {
                    const isCustomer = msg.senderType === 'customer'
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-slate-500">
                          <strong>{msg.senderName}</strong>
                          <span>&bull;</span>
                          <span>{new Date(msg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                          {!isCustomer && (
                            <span className="ml-1 text-[10px] text-cyan-700 bg-cyan-50 px-1.5 rounded">
                              Händler
                            </span>
                          )}
                        </div>

                        <div
                          className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                            isCustomer
                              ? 'bg-white text-slate-900 border border-slate-200 rounded-tl-sm'
                              : 'bg-cyan-600 text-white rounded-tr-sm shadow-cyan-600/10'
                          }`}
                        >
                          <p className="whitespace-pre-line">{msg.messageText}</p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Answer Composer Area */}
              <div className="p-4 border-t border-slate-200 bg-white space-y-3">
                {/* Quick Templates Dropdown */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-cyan-600" />
                    <span className="text-xs font-bold text-slate-600">Schnell-Antwort einfügen:</span>
                  </div>
                  <select
                    onChange={(e) => {
                      const idx = parseInt(e.target.value, 10)
                      if (!isNaN(idx) && QUICK_TEMPLATES[idx]) {
                        setAnswerText(QUICK_TEMPLATES[idx].text)
                      }
                    }}
                    defaultValue=""
                    className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  >
                    <option value="" disabled>Vorlage auswählen...</option>
                    {QUICK_TEMPLATES.map((tmpl, idx) => (
                      <option key={idx} value={idx}>
                        {tmpl.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Textarea (Strict text-slate-900, placeholder:text-slate-500 accessibility compliance) */}
                <textarea
                  rows={3}
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Antwort an den Kunden verfassen (wird automatisch über das OTTO-Gateway übermittelt)..."
                  className="w-full p-3.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-900 placeholder:text-slate-500 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 leading-relaxed"
                />

                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-slate-400">
                    Versand erfolgt mit deiner im OTTO-Portal hinterlegten Kundenservice-Adresse.
                  </p>

                  <button
                    onClick={handleSendAnswer}
                    disabled={isAnswering || !answerText.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold shadow-md shadow-cyan-600/20 transition-all disabled:opacity-50 disabled:shadow-none"
                  >
                    <Send size={15} />
                    <span>{isAnswering ? 'Wird gesendet...' : 'Antwort senden'}</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <MessageSquareText size={28} />
              </div>
              <h3 className="text-base font-bold text-slate-800">Keine Anfrage ausgewählt</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Wähle eine Kundenanfrage aus der linken Liste aus, um Details einzusehen und direkt zu antworten.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Custom Modal: Anfrage manuell erfassen */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Kundenanfrage manuell erfassen</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Übertrage eine Anfrage aus dem OTTO-Portal oder E-Mail-Postfach, um sie hier inklusive Frist zu verwalten und direkt zu beantworten.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateManualQuestion} className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={16} className="text-rose-600" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Marketplace */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Marktplatz</label>
                  <select
                    value={modalForm.marketplace}
                    onChange={(e) => setModalForm({ ...modalForm, marketplace: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="otto">OTTO Market</option>
                    <option value="kaufland">Kaufland</option>
                    <option value="amazon">Amazon</option>
                    <option value="ebay">eBay</option>
                  </select>
                </div>

                {/* Question Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Art der Anfrage</label>
                  <select
                    value={modalForm.questionType}
                    onChange={(e) => setModalForm({ ...modalForm, questionType: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="product">Frage zum Produkt</option>
                    <option value="order">Frage zur Bestellung</option>
                    <option value="general">Allgemeine Anfrage</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Customer Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Kundenname *</label>
                  <input
                    type="text"
                    required
                    placeholder="z.B. Sabine Weber"
                    value={modalForm.customerName}
                    onChange={(e) => setModalForm({ ...modalForm, customerName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 placeholder:text-slate-500 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                {/* Customer Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Kunden-E-Mail / OTTO-Relay</label>
                  <input
                    type="email"
                    placeholder="knd-12345@otto.de"
                    value={modalForm.customerEmail || ''}
                    onChange={(e) => setModalForm({ ...modalForm, customerEmail: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 placeholder:text-slate-500 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* SKU */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Artikel-SKU (optional)</label>
                  <input
                    type="text"
                    placeholder="z.B. SKU-1002"
                    value={modalForm.productSku || ''}
                    onChange={(e) => setModalForm({ ...modalForm, productSku: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 placeholder:text-slate-500 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                {/* Order ID */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Bestellnummer (optional)</label>
                  <input
                    type="text"
                    placeholder="z.B. OTTO-94812"
                    value={modalForm.marketplaceOrderId || ''}
                    onChange={(e) => setModalForm({ ...modalForm, marketplaceOrderId: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 placeholder:text-slate-500 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Betreff *</label>
                <input
                  type="text"
                  required
                  placeholder="Betreff der Anfrage"
                  value={modalForm.subject}
                  onChange={(e) => setModalForm({ ...modalForm, subject: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 placeholder:text-slate-500 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Question Text */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Kundenanfrage (Nachricht) *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Was möchte die Kundin oder der Kunde wissen?"
                  value={modalForm.questionText}
                  onChange={(e) => setModalForm({ ...modalForm, questionText: e.target.value })}
                  className="w-full p-3.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 placeholder:text-slate-500 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Footer Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingModal}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold shadow-md shadow-cyan-600/20 transition-all disabled:opacity-50"
                >
                  {isSubmittingModal ? 'Wird gespeichert...' : 'Frage anlegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Help & Info Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setShowHelpModal(false)}
          />
          <div className="relative bg-white rounded-2xl p-6 sm:p-7 shadow-2xl w-full max-w-2xl border border-slate-200 text-left my-8 z-10 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center flex-shrink-0">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Kundenanfragen & Marktplatz-Schnittstelle</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Übersicht zu Funktionen, Fristen und Marktplatz-Anbindung</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Schließen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="space-y-4 py-4 text-sm text-slate-600">
              {/* Technical background notice */}
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-amber-900">
                <div className="flex items-start gap-3">
                  <div className="p-1 rounded-lg bg-amber-100 text-amber-700 flex-shrink-0 mt-0.5">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <h4 className="font-bold text-amber-900 text-sm">
                      Wichtiger technischer Hintergrund zu OTTO Market
                    </h4>
                    <p className="text-xs leading-relaxed text-amber-800 mt-1">
                      Anders als für Bestellungen (<code className="font-mono">/v4/orders</code>) und Retouren (<code className="font-mono">/v3/returns</code>) stellt OTTO Partner Connect <strong>keine öffentliche REST-API für Kundenanfragen (Klärfälle)</strong> bereit. 
                      Stattdessen läuft die gesamte Kundenkommunikation bei OTTO über das offizielle <strong>E-Mail-Relay-Gateway (<code className="font-mono">*@customer.otto.market</code>)</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* 1. Was muss der Händler einrichten? */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <h4 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                  1. Einmalige Einrichtung für Händler (3 Schritte)
                </h4>
                <ol className="text-xs leading-relaxed text-slate-700 space-y-2 list-decimal list-inside">
                  <li>
                    <strong>Im OTTO-Portal (OPC):</strong> Hinterlege unter <em>Einstellungen → Unternehmensdaten / Ansprechpartner</em> deine offizielle Kundenservice-E-Mail-Adresse und aktiviere die E-Mail-Benachrichtigung für neue Kundenanfragen.
                  </li>
                  <li>
                    <strong>Eingehende Nachrichten (E-Mail-Weiterleitung / Webhook):</strong> Leite eingehende E-Mails von <code className="bg-slate-200/80 px-1 py-0.5 rounded font-mono text-slate-900">*@customer.otto.market</code> (z.&nbsp;B. über Make, Zapier, Cloudflare Email Routing oder Mailgun/SendGrid Inbound Parse) per <code className="font-mono">POST</code> an <code className="bg-slate-200/80 px-1 py-0.5 rounded font-mono text-slate-900">/api/webhooks/marketplace-questions</code> weiter. Dadurch wird der echte Nachrichtentext des Kunden automatisch importiert und anhand der OTTO-Bestellnummer (<code className="font-mono">cbn...</code>) mit dem Auftrag verknüpft.
                  </li>
                  <li>
                    <strong>Ausgehende Antworten (Eigener SMTP-Server):</strong> Da das OTTO-Gateway Antworten nur von deiner bei OTTO verifizierten Kundenservice-E-Mail akzeptiert, aktiviere unter <Link href="/settings#smtp-settings" className="text-cyan-700 underline font-semibold">Einstellungen → E-Mail-Versand (SMTP)</Link> deinen eigenen SMTP-Server mit exakt dieser Absender-Adresse.
                  </li>
                </ol>
              </div>

              {/* 2. SLA & Fristenüberwachung (48h Werktage) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <h4 className="font-bold text-slate-900 text-sm mb-1.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  2. SLA & Fristen-Countdown (48h an Werktagen)
                </h4>
                <p className="text-xs leading-relaxed text-slate-700">
                  OTTO schreibt eine verbindliche Beantwortungsfrist von <strong>48 Geschäftsstunden</strong> (Montag bis Freitag) vor. 
                  Die integrierte Fristuhr berechnet die verbleibende Zeit unter Berücksichtigung von Wochenenden minutengenau.
                </p>
                <ul className="mt-2 text-xs space-y-1.5 text-slate-700 list-disc list-inside">
                  <li><strong>Neue Anfragen (Offen):</strong> Die Fristuhr läuft live herunter und warnt bei &lt; 24h Restzeit gelb bzw. rot vor drohenden SLA-Strafen oder Performance-Abzügen.</li>
                  <li><strong>In Bearbeitung:</strong> Fälle, die aktuell in Prüfung oder Klärung sind, pausieren die Frist und haben keine aktive Strafandrohung.</li>
                  <li><strong>Beantwortet / Erledigt:</strong> Nach dem Absenden der Antwort über deinen SMTP-Server an die <code className="font-mono">@customer.otto.market</code>-Adresse wird die Antwort automatisch im OTTO-Ticket hinterlegt.</li>
                </ul>
              </div>

              {/* 3. Beantwortung & Vorlagen */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <h4 className="font-bold text-slate-900 text-sm mb-1.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  3. Beantwortung & Schnellvorlagen
                </h4>
                <p className="text-xs leading-relaxed text-slate-700">
                  Antworten werden direkt im Nachrichtenfenster formuliert und per SMTP über das OTTO-Gateway an die geschützte Kundenadresse (<code className="font-mono">*@customer.otto.market</code>) übermittelt. 
                  Über die <strong>Schnellvorlagen</strong> (z.&nbsp;B. Sendungsverfolgung übermitteln, Retourenhilfe, Kulanz/Teilerstattung) sparst du wertvolle Zeit bei Routineanfragen.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-md transition-all cursor-pointer"
              >
                Verstanden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

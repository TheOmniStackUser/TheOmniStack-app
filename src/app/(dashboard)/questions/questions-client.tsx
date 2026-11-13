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
  ArrowUpDown
} from 'lucide-react'
import {
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
  status: 'open' | 'answered' | 'closed'
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

interface QuestionsClientProps {
  initialQuestions: QuestionItem[]
  activeMarketplaces: { id: string; name: string }[]
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
  activeMarketplaces
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'urgent' | 'answered' | 'closed'>('all')
  const [sortOrder, setSortOrder] = useState<'deadline' | 'newest' | 'oldest'>('deadline')

  // Answer composer state
  const [answerText, setAnswerText] = useState('')
  const [isAnswering, startAnswering] = useTransition()
  const [isSyncing, startSyncing] = useTransition()

  // Modal State for Manual / Test Question creation
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalForm, setModalForm] = useState<ManualQuestionInput>({
    marketplace: 'otto',
    customerName: '',
    customerEmail: '',
    subject: '',
    questionText: '',
    questionType: 'product',
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
    const urgentCount = questions.filter(
      (q) => q.status === 'open' && (q.sla.severity === 'urgent' || q.sla.severity === 'overdue')
    ).length
    const answeredCount = questions.filter((q) => q.status === 'answered').length
    const closedCount = questions.filter((q) => q.status === 'closed').length
    return {
      all: questions.length,
      open: openCount,
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
        if (statusFilter === 'urgent') {
          if (q.status !== 'open') return false
          if (q.sla.severity !== 'urgent' && q.sla.severity !== 'overdue') return false
        }
        if (statusFilter === 'answered' && q.status !== 'answered') return false
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
  const handleUpdateStatus = (newStatus: 'open' | 'answered' | 'closed') => {
    if (!selectedQuestionId) return

    updateQuestionStatusAction(selectedQuestionId, newStatus)
      .then((res) => {
        if (res.success) {
          showNotification('success', `Status auf "${newStatus}" gesetzt.`)
          setQuestions((prev) =>
            prev.map((q) =>
              q.id === selectedQuestionId
                ? {
                    ...q,
                    status: newStatus,
                    sla: {
                      ...q.sla,
                      severity: newStatus === 'open' ? 'warning' : 'resolved',
                      label: newStatus === 'open' ? 'Wiedereröffnet' : newStatus === 'answered' ? 'Beantwortet' : 'Geschlossen'
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

  // Modal Handlers
  const handlePreloadOttoSample = (type: 'product' | 'order') => {
    if (type === 'product') {
      setModalForm({
        marketplace: 'otto',
        customerName: 'Sabine Weber',
        customerEmail: 'knd-9382104@otto.de',
        subject: 'Frage zu Artikelgröße und Material',
        questionText: 'Hallo, ist das Produkt auch in der Farbe Weiß verfügbar und wie hoch ist die maximale Belastbarkeit? Vielen Dank!',
        questionType: 'product',
        productSku: 'SKU-OTTO-1002',
        productTitle: 'Premium Wandregal Eiche Massiv',
        marketplaceOrderId: '',
        slaHours: 48
      })
    } else {
      setModalForm({
        marketplace: 'otto',
        customerName: 'Michael Schulz',
        customerEmail: 'knd-7462193@otto.de',
        subject: 'Lieferzeit & Sendungsverfolgung',
        questionText: 'Guten Tag, können Sie mir bitte mitteilen, wann meine Sendung voraussichtlich zugestellt wird? Die Sendungsverfolgung aktualisiert sich seit gestern nicht mehr.',
        questionType: 'order',
        productSku: '',
        productTitle: '',
        marketplaceOrderId: 'OTTO-2026-94812',
        slaHours: 48
      })
    }
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
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                Kundenanfragen & Nachrichten
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Marktplatz-Anfragen (OTTO u.a.) einsehen, Fristen überwachen und direkt beantworten.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-semibold shadow-sm" title="Automatischer Hintergrundabruf läuft alle 30 Minuten">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Auto-Abruf aktiv (alle 30 Min.)</span>
          </div>

          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
            title="Fragen von OTTO und Marktplätzen jetzt sofort manuell aktualisieren"
          >
            <RefreshCw size={16} className={isSyncing ? 'animate-spin text-cyan-600' : 'text-slate-500'} />
            <span>{isSyncing ? 'Synchronisiere...' : 'Fragen abrufen'}</span>
          </button>

          <button
            onClick={() => {
              setModalError(null)
              setIsModalOpen(true)
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold shadow-md shadow-cyan-600/20 transition-all"
          >
            <Plus size={18} />
            <span>Frage erfassen / testen</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
            <span className="text-xs font-bold text-cyan-700 uppercase tracking-wider">Offen</span>
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{counts.open}</span>
            <span className="text-xs font-medium text-slate-500">zu beantworten</span>
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
              <option value="all">Alle Marktplätze</option>
              {activeMarketplaces.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
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
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  {searchQuery || statusFilter !== 'all' || selectedMarketplace !== 'all'
                    ? 'Versuche deine Filter zurückzusetzen.'
                    : 'Es liegen derzeit keine offenen Kundenanfragen vor.'}
                </p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                >
                  <Plus size={14} />
                  <span>Beispielfrage erfassen</span>
                </button>
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
                      <button
                        onClick={() => handleUpdateStatus('answered')}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all"
                      >
                        Als erledigt markieren
                      </button>
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

      {/* Custom Modal: Frage manuell erfassen oder OTTO-Testnachricht importieren */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Frage erfassen / testen</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Erfasse eine Kundenanfrage oder importiere eine realistische OTTO-Beispielfrage.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Sample Buttons */}
            <div className="p-4 px-6 bg-cyan-50/50 border-b border-cyan-100 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-cyan-900">OTTO Test-Frage einfügen:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePreloadOttoSample('product')}
                  className="px-2.5 py-1 rounded-lg bg-white border border-cyan-200 text-cyan-800 text-xs font-semibold hover:bg-cyan-100 transition-all shadow-sm"
                >
                  Produktfrage
                </button>
                <button
                  type="button"
                  onClick={() => handlePreloadOttoSample('order')}
                  className="px-2.5 py-1 rounded-lg bg-white border border-cyan-200 text-cyan-800 text-xs font-semibold hover:bg-cyan-100 transition-all shadow-sm"
                >
                  Bestellfrage
                </button>
              </div>
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
    </div>
  )
}

'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { getInvoiceDownloadUrl, getInvoiceXmlAction, regenerateInvoicePdfAction } from '@/app/actions/invoices'
import { getInvoiceLogsAction } from '@/app/actions/manual-invoice'
import { exportInvoiceJournalAction } from '@/app/actions/export'

interface Invoice {
  id: string
  invoiceNumber: string
  recipientName: string | null
  recipientCountry: string | null
  totalAmount: string
  currency: string
  createdAt: Date
  pdfStorageKey: string | null
  marketplace: string | null
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

export function InvoiceList({ initialInvoices }: { initialInvoices: Invoice[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [showHistory, setShowHistory] = useState<string | null>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)
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
    setCurrentPage(1)
  }

  const handleDownload = async (invoiceId: string) => {
    try {
      setLoadingId(invoiceId)
      const url = await getInvoiceDownloadUrl(invoiceId)
      window.open(url, '_blank')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Fehler beim Laden der Rechnung.')
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
      alert('Fehler beim Generieren der E-Rechnung (XML).')
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
      alert(error instanceof Error ? error.message : 'Fehler beim Aktualisieren der Rechnung.')
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
      alert('Fehler beim Exportieren des Rechnungsausgangsbuchs.')
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
      alert('Fehler beim Laden der Historie.')
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
    if (activeFilters.marketplace !== 'all' && invoice.marketplace !== activeFilters.marketplace) {
      return false
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

  // Pagination Logic
  const totalPages = Math.ceil(filteredInvoices.length / pageSize)
  const paginatedInvoices = filteredInvoices.slice(
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
                className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg leading-5 bg-slate-50/30 text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
              />
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
            <option value="otto">Otto</option>
            <option value="mirakl_decathlon">Decathlon</option>
            <option value="amazon">Amazon</option>
            <option value="shopify">Shopify</option>
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
              <th className="px-6 py-4 font-semibold text-slate-700">Datum</th>
              <th className="px-6 py-4 font-semibold text-slate-700">Rechnungsnummer</th>
              <th className="px-6 py-4 font-semibold text-slate-700">Marktplatz</th>
              <th className="px-6 py-4 font-semibold text-slate-700">Kunde</th>
              <th className="px-6 py-4 font-semibold text-slate-700">Land</th>
              <th className="px-6 py-4 font-semibold text-slate-700 text-right">Betrag</th>
              <th className="px-6 py-4 font-semibold text-slate-700 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {paginatedInvoices.map((invoice) => (
              <tr key={invoice.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-slate-600">
                  {format(new Date(invoice.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                </td>
                <td className="px-6 py-4 font-medium text-slate-900">
                  <div className="flex flex-col">
                    <span>{invoice.invoiceNumber}</span>
                    <span className="text-[10px] text-blue-600 font-bold uppercase tracking-tighter">E-Rechnung (ZUGFeRD)</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wider">
                    {invoice.marketplace || 'Manual'}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-600">
                  {invoice.recipientName || '–'}
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 tracking-wide font-mono">
                    {formatCountry(invoice.recipientCountry)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right font-medium text-slate-900">
                  {new Intl.NumberFormat('de-DE', { style: 'currency', currency: invoice.currency }).format(Number(invoice.totalAmount))}
                </td>
                 <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 min-w-max whitespace-nowrap">
                    <button
                      onClick={() => handleDownload(invoice.id)}
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
                      onClick={() => handleRegenerate(invoice.id)}
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
                      onClick={() => handleDownloadXml(invoice.id, invoice.invoiceNumber)}
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
                        <a
                          href={`/invoices/new?edit=${invoice.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-700 hover:bg-amber-100 transition-all"
                          title="Rechnung bearbeiten (GoBD-konform mit Log)"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </a>
                        <button
                          onClick={() => handleShowHistory(invoice.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all"
                          title="Änderungshistorie anzeigen"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          History
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredInvoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
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
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Änderungshistorie</h3>
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
    </div>
  )
}

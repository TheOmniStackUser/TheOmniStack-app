'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { MoreHorizontal, Search, CheckCircle, Trash2, XCircle, ExternalLink, Calendar, Banknote } from 'lucide-react'
import { markIncomingAsPaidAction, deleteIncomingInvoiceAction } from '@/app/actions/invoices-import'
import { useRouter } from 'next/navigation'

interface IncomingInvoice {
  id: string
  supplierName: string
  invoiceNumber: string
  status: 'draft' | 'pending_payment' | 'paid' | 'cancelled'
  currency: string
  totalAmount: string
  issuedAt: Date | null
  dueAt: Date | null
  paidAt: Date | null
}

export function IncomingInvoiceList({ initialInvoices }: { initialInvoices: IncomingInvoice[] }) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_payment' | 'paid'>('all')
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Filter invoices based on search and status
  const filteredInvoices = useMemo(() => {
    return initialInvoices.filter(inv => {
      const matchesSearch = 
        (inv.supplierName && inv.supplierName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()))
        
      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [initialInvoices, searchQuery, statusFilter])

  // Calculate totals
  const totalAmount = filteredInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0)
  const pendingCount = filteredInvoices.filter(i => i.status === 'pending_payment').length

  const handleMarkAsPaid = async (id: string) => {
    try {
      setIsProcessing(true)
      setActiveMenuId(null)
      const res = await markIncomingAsPaidAction(id)
      if (res.success) {
        router.refresh()
      } else {
        alert(res.error || 'Fehler beim Aktualisieren')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Möchtest du diese Eingangsrechnung wirklich löschen?')) return
    try {
      setIsProcessing(true)
      setActiveMenuId(null)
      const res = await deleteIncomingInvoiceAction(id)
      if (res.success) {
        router.refresh()
      } else {
        alert(res.error || 'Fehler beim Löschen')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Banknote size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Ausgaben (Gefiltert)</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">
              {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalAmount)}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Calendar size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Offene Belege</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{pendingCount}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Nach Lieferant oder Rechnungsnummer suchen..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400"
          />
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
          <button 
            onClick={() => setStatusFilter('all')}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Alle
          </button>
          <button 
            onClick={() => setStatusFilter('pending_payment')}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${statusFilter === 'pending_payment' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Offen
          </button>
          <button 
            onClick={() => setStatusFilter('paid')}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${statusFilter === 'paid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Bezahlt
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative">
        {isProcessing && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Lieferant / Partner</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Rechnungsnummer</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Datum</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Betrag</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Keine Eingangsrechnungen gefunden.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{inv.supplierName}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-600">{inv.invoiceNumber}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-500">
                        {inv.issuedAt ? format(new Date(inv.issuedAt), 'dd.MM.yyyy', { locale: de }) : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="font-extrabold text-slate-900">
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: inv.currency }).format(Number(inv.totalAmount))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {inv.status === 'paid' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Bezahlt
                        </span>
                      ) : inv.status === 'pending_payment' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                          <ExternalLink className="w-3.5 h-3.5" />
                          Offen
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                          {inv.status}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      <button 
                        onClick={() => setActiveMenuId(activeMenuId === inv.id ? null : inv.id)}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200"
                      >
                        <MoreHorizontal size={20} />
                      </button>

                      {/* Dropdown Menu */}
                      {activeMenuId === inv.id && (
                        <div className="absolute right-8 top-12 w-48 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 z-20 py-2 animate-in fade-in zoom-in-95">
                          {inv.status !== 'paid' && (
                            <button 
                              onClick={() => handleMarkAsPaid(inv.id)}
                              className="w-full text-left px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              Als bezahlt markieren
                            </button>
                          )}
                          <button 
                            onClick={() => handleDelete(inv.id)}
                            className="w-full text-left px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Löschen
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Click outside to close menu overlay */}
      {activeMenuId && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setActiveMenuId(null)}
        />
      )}
    </div>
  )
}

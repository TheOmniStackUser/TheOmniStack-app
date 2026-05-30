'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  deleteReturnAction,
  bulkDeleteReturnsAction,
  updateReturnStatusAction,
  updateReturnAction,
  refundReturnAction,
  getOrderDetailsAction
} from '@/app/actions/returns'

interface ScannedItem {
  id?: string
  skuOrProductName: string
  quantity: number
  condition: string
  notes?: string | null
}

interface ReturnLog {
  id: string
  orderNumber: string
  customerName: string | null
  shippingAddress: string | null
  scannedAt: Date
  receivedAt: Date
  status: string
  marketplace: string | null
  notes: string | null
  orderId: string | null
  metadata: any
  items: ScannedItem[]
}

interface ReturnsListProps {
  initialLogs: any[]
  hasKauflandIntegration?: boolean
  hasEbayIntegration?: boolean
}

export function ReturnsList({ 
  initialLogs,
  hasKauflandIntegration = false,
  hasEbayIntegration = false,
}: ReturnsListProps) {
  const [logs, setLogs] = useState<ReturnLog[]>(
    initialLogs.map((l) => ({
      ...l,
      scannedAt: new Date(l.scannedAt),
      receivedAt: l.receivedAt ? new Date(l.receivedAt) : new Date(l.scannedAt),
      items: l.items || []
    }))
  )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'neu' | 'bearbeitet'>('neu')
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all')
  const [isPending, startTransition] = useTransition()

  // Pagination State
  const [pageSize, setPageSize] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)

  // Edit Modal State
  const [editingLog, setEditingLog] = useState<ReturnLog | null>(null)
  const [editOrderNumber, setEditOrderNumber] = useState('')
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editShippingAddress, setEditShippingAddress] = useState('')
  const [editStatus, setEditStatus] = useState('neu')
  const [editMarketplace, setEditMarketplace] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editItems, setEditItems] = useState<ScannedItem[]>([])
  const [editScannedAt, setEditScannedAt] = useState('')
  const [editReceivedAt, setEditReceivedAt] = useState('')

  // Refund Modal State
  const [refundingLog, setRefundingLog] = useState<ReturnLog | null>(null)
  const [refundItemsInput, setRefundItemsInput] = useState<{ sku: string; title: string; orderQty: number; returnedQty: number; refundQty: number }[]>([])
  const [isRefundingPending, startRefundTransition] = useTransition()

  const handleOpenRefund = async (log: ReturnLog) => {
    const orderId = log.orderId
    if (!orderId) return
    startRefundTransition(async () => {
      try {
        const orderDetails = await getOrderDetailsAction(orderId)
        
        // Match order items with returned items
        const inputs = orderDetails.items.map((orderItem: any) => {
          const matchingScannedItem = log.items.find(
            item => item.skuOrProductName.toLowerCase() === orderItem.sku?.toLowerCase()
          )
          const returnedQty = matchingScannedItem ? matchingScannedItem.quantity : 0
          
          return {
            sku: orderItem.sku || 'N/A',
            title: orderItem.title,
            orderQty: parseInt(orderItem.quantity) || 1,
            returnedQty,
            refundQty: returnedQty // default to the returned quantity
          }
        })
        
        setRefundItemsInput(inputs)
        setRefundingLog(log)
      } catch (err: any) {
        alert(err.message || 'Fehler beim Laden der Bestelldaten.')
      }
    })
  }

  const handleRefundQtyChange = (index: number, val: number) => {
    const next = [...refundItemsInput]
    next[index].refundQty = Math.max(0, Math.min(next[index].orderQty, val))
    setRefundItemsInput(next)
  }

  const handleRefundAllToggle = (refundAll: boolean) => {
    const next = refundItemsInput.map(item => ({
      ...item,
      refundQty: refundAll ? item.orderQty : item.returnedQty
    }))
    setRefundItemsInput(next)
  }

  const handleExecuteRefund = async () => {
    if (!refundingLog) return
    
    const payload = refundItemsInput
      .filter(item => item.refundQty > 0)
      .map(item => ({
        sku: item.sku,
        quantity: item.refundQty
      }))

    if (payload.length === 0) {
      alert('Bitte wähle mindestens einen Artikel mit einer Menge größer als 0 aus.')
      return
    }

    startRefundTransition(async () => {
      try {
        const res = await refundReturnAction(refundingLog.id, payload)
        if (res.success) {
          alert(`Erstattung erfolgreich veranlasst (Gutschrift: ${res.creditNoteNumber}).`)
          // Update status in local logs state
          setLogs(prev => prev.map(l => {
            if (l.id === refundingLog.id) {
              return {
                ...l,
                status: 'bearbeitet',
                notes: `Rückerstattung veranlasst: Gutschrift ${res.creditNoteNumber} erstellt.`
              }
            }
            return l
          }))
          setRefundingLog(null)
        }
      } catch (err: any) {
        alert(err.message || 'Fehler bei der Rückerstattung.')
      }
    })
  }

  // Search & Filter
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.notes || '').toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter
    
    const matchesMarketplace =
      marketplaceFilter === 'all' ||
      (marketplaceFilter === 'direct' && !log.marketplace) ||
      (log.marketplace?.toLowerCase() === marketplaceFilter.toLowerCase())

    return matchesSearch && matchesStatus && matchesMarketplace
  })

  // Pagination Logic
  const totalPages = Math.ceil(filteredLogs.length / pageSize)
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // Selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredLogs.map((l) => l.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  // Actions
  const handleDeleteSingle = async (id: string) => {
    if (!confirm('Möchtest du diesen Eintrag wirklich löschen?')) return
    startTransition(async () => {
      try {
        await deleteReturnAction(id)
        setLogs((prev) => prev.filter((l) => l.id !== id))
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      } catch (err) {
        alert('Fehler beim Löschen.')
      }
    })
  }

  const handleBulkDelete = async () => {
    const count = selectedIds.size
    if (count === 0) return
    if (!confirm(`Möchtest du die ${count} ausgewählten Einträge wirklich löschen?`)) return

    const idsArray = Array.from(selectedIds)
    startTransition(async () => {
      try {
        await bulkDeleteReturnsAction(idsArray)
        setLogs((prev) => prev.filter((l) => !selectedIds.has(l.id)))
        setSelectedIds(new Set())
      } catch (err) {
        alert('Fehler beim Massen-Löschen.')
      }
    })
  }

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'neu' ? 'bearbeitet' : 'neu'
    startTransition(async () => {
      try {
        await updateReturnStatusAction(id, newStatus)
        setLogs((prev) =>
          prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l))
        )
      } catch (err) {
        alert('Fehler beim Ändern des Status.')
      }
    })
  }

  const handleBulkStatusChange = async (newStatus: string) => {
    const idsArray = Array.from(selectedIds)
    if (idsArray.length === 0) return
    startTransition(async () => {
      try {
        for (const id of idsArray) {
          await updateReturnStatusAction(id, newStatus)
        }
        setLogs((prev) =>
          prev.map((l) => (selectedIds.has(l.id) ? { ...l, status: newStatus } : l))
        )
        setSelectedIds(new Set())
      } catch (err) {
        alert('Fehler beim Massen-Status-Änderung.')
      }
    })
  }

  // Edit Modal Handlers
  const handleOpenEdit = (log: ReturnLog) => {
    setEditingLog(log)
    setEditOrderNumber(log.orderNumber)
    setEditCustomerName(log.customerName || '')
    setEditShippingAddress(log.shippingAddress || '')
    setEditStatus(log.status || 'neu')
    setEditMarketplace(log.marketplace || '')
    setEditNotes(log.notes || '')
    setEditItems(log.items.map((i) => ({ ...i })))
    
    // Format scannedAt Date for <input type="datetime-local" />
    if (log.scannedAt) {
      const tzoffset = log.scannedAt.getTimezoneOffset() * 60000
      const localTime = new Date(log.scannedAt.getTime() - tzoffset).toISOString().slice(0, 16)
      setEditScannedAt(localTime)
    } else {
      setEditScannedAt('')
    }

    // Format receivedAt Date for <input type="datetime-local" />
    if (log.receivedAt) {
      const tzoffset = log.receivedAt.getTimezoneOffset() * 60000
      const localTime = new Date(log.receivedAt.getTime() - tzoffset).toISOString().slice(0, 16)
      setEditReceivedAt(localTime)
    } else {
      setEditReceivedAt('')
    }
  }

  const handleAddItem = () => {
    setEditItems([...editItems, { skuOrProductName: '', quantity: 1, condition: 'new' }])
  }

  const handleRemoveItem = (index: number) => {
    setEditItems(editItems.filter((_, idx) => idx !== index))
  }

  const handleItemChange = (index: number, field: keyof ScannedItem, value: any) => {
    const next = [...editItems]
    next[index] = { ...next[index], [field]: value }
    setEditItems(next)
  }

  const handleSaveEdit = async () => {
    if (!editingLog) return
    const cleanedOrderNumber = editOrderNumber.trim()
    if (!cleanedOrderNumber) {
      alert('Bestellnummer darf nicht leer sein.')
      return
    }

    startTransition(async () => {
      try {
        const payload = {
          orderNumber: cleanedOrderNumber,
          customerName: editCustomerName.trim(),
          shippingAddress: editShippingAddress.trim(),
          status: editStatus,
          marketplace: editMarketplace || null,
          notes: editNotes.trim() || null,
          scannedAt: editScannedAt ? new Date(editScannedAt) : null,
          receivedAt: editReceivedAt ? new Date(editReceivedAt) : null,
          items: editItems.map((i) => ({
            ...i,
            skuOrProductName: i.skuOrProductName.trim() || 'Unbekannt'
          }))
        }

        await updateReturnAction(editingLog.id, payload)

        // Update local state
        setLogs((prev) =>
          prev.map((l) => {
            if (l.id === editingLog.id) {
              return {
                ...l,
                orderNumber: payload.orderNumber,
                customerName: payload.customerName,
                shippingAddress: payload.shippingAddress,
                status: payload.status,
                marketplace: payload.marketplace,
                notes: payload.notes,
                scannedAt: payload.scannedAt || l.scannedAt,
                receivedAt: payload.receivedAt || l.receivedAt,
                items: editItems
              }
            }
            return l
          })
        )
        setEditingLog(null)
      } catch (err) {
        alert('Fehler beim Speichern der Änderungen.')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="relative w-full md:max-w-xs">
          <input
            type="text"
            placeholder="Bestellnr., Kunde, Notiz suchen..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white text-slate-900 placeholder-slate-400 font-medium"
          />
          <svg className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {/* Marketplace Filter */}
          <select
            value={marketplaceFilter}
            onChange={(e) => {
              setMarketplaceFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white text-slate-600 font-medium"
          >
            <option value="all">Alle Kanäle</option>
            <option value="direct">Direkt / Kein Marktplatz</option>
            <option value="Amazon">Amazon</option>
            <option value="Otto">Otto</option>
            <option value="Zalando">Zalando</option>
            {hasKauflandIntegration && <option value="Kaufland">Kaufland</option>}
            {hasEbayIntegration && <option value="eBay">eBay</option>}
            <option value="Mirakl">Mirakl</option>
          </select>

          {/* Status Filters */}
          <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => {
                setStatusFilter('all')
                setCurrentPage(1)
              }}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Alle
            </button>
            <button
              onClick={() => {
                setStatusFilter('neu')
                setCurrentPage(1)
              }}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                statusFilter === 'neu'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Neu
            </button>
            <button
              onClick={() => {
                setStatusFilter('bearbeitet')
                setCurrentPage(1)
              }}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                statusFilter === 'bearbeitet'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Bearbeitet
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Actions Header */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-4 bg-indigo-50 border border-indigo-100 rounded-xl animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-indigo-900">
              {selectedIds.size} {selectedIds.size === 1 ? 'Eintrag' : 'Einträge'} ausgewählt
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkStatusChange('bearbeitet')}
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-xs font-bold transition-all disabled:opacity-50"
            >
              ✓ Bearbeitet
            </button>
            <button
              onClick={() => handleBulkStatusChange('neu')}
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-xs font-bold transition-all disabled:opacity-50"
            >
              Neu
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Löschen
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
        <table className="min-w-[1400px] w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 w-10 text-center">
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  checked={filteredLogs.length > 0 && selectedIds.size === filteredLogs.length}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Eingang</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Scan-Zeitpunkt</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Marktplatz</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Bestellnummer</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Versand</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Kunde & Notiz</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Artikel / Zustand</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-slate-400 italic">
                  Keine Retouren gefunden.
                </td>
              </tr>
            ) : (
              paginatedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/30 transition-colors">
                  {/* Checkbox */}
                  <td className="px-6 py-4 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(log.id)}
                      onChange={() => handleSelectOne(log.id)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                  </td>

                  {/* Status Toggle */}
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleStatusToggle(log.id, log.status)}
                      disabled={isPending}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer select-none ${
                        log.status === 'bearbeitet'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                      }`}
                      title="Klicken, um den Status zu wechseln"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'bearbeitet' ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                      {log.status === 'bearbeitet' ? 'Bearbeitet' : 'Neu'}
                    </button>
                  </td>

                  {/* Eingang (Date only) */}
                  <td className="px-6 py-4">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5" title="Datum des Retoureneingangs">
                      <svg className="w-3.5 h-3.5 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>{format(log.receivedAt, 'dd.MM.yyyy', { locale: de })}</span>
                    </div>
                  </td>

                  {/* Scan-Zeitpunkt (Date + Time) */}
                  <td className="px-6 py-4">
                    <div className="text-xs text-slate-600 font-semibold flex items-center gap-1.5" title="Scan-Zeitpunkt (System-Log)">
                      <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{format(log.scannedAt, 'dd.MM.yyyy HH:mm', { locale: de })}</span>
                    </div>
                  </td>

                  {/* Marketplace Badge */}
                  <td className="px-6 py-4">
                    {log.marketplace ? (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                        log.marketplace.toLowerCase() === 'amazon'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : log.marketplace.toLowerCase() === 'otto'
                          ? 'bg-red-50 text-red-800 border-red-200'
                          : log.marketplace.toLowerCase() === 'zalando'
                          ? 'bg-orange-50 text-orange-800 border-orange-200'
                          : log.marketplace.toLowerCase() === 'kaufland'
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : log.marketplace.toLowerCase() === 'ebay'
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      }`}>
                        {log.marketplace}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Direkt / Unbekannt</span>
                    )}
                  </td>

                  {/* Order ID */}
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{log.orderNumber}</div>
                    {log.orderId ? (
                      <span className="inline-flex items-center text-[10px] font-bold text-emerald-600 mt-0.5">
                        ● Zugeordnet
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] font-bold text-slate-400 mt-0.5">
                        ● Nicht gefunden
                      </span>
                    )}
                  </td>

                  {/* Carrier */}
                  {(() => {
                    const carrier = log.metadata?.carrier
                    const trackingNumber = log.metadata?.tracking_number
                    return (
                      <td className="px-6 py-4">
                        {carrier ? (
                          <div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {carrier}
                            </span>
                            {trackingNumber && (
                              <div className="text-[10px] text-slate-400 font-mono mt-1 truncate max-w-[120px]" title={trackingNumber}>
                                {trackingNumber}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">-</span>
                        )}
                      </td>
                    )
                  })()}

                  {/* Customer & Notes */}
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-slate-950">{log.customerName || 'Kein Name'}</div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[150px] mt-0.5">{log.shippingAddress || 'Keine Adresse'}</div>
                    {log.notes && (
                      <div className="mt-1.5 flex items-start gap-1 p-1.5 bg-amber-50/70 border border-amber-100 rounded-lg max-w-[180px]">
                        <svg className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                        <div className="text-[10px] font-medium text-amber-800 break-words leading-tight">
                          {log.notes}
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Items / Conditions */}
                  <td className="px-6 py-4 space-y-2">
                    {log.items.map((item, idx) => (
                      <div key={idx} className="flex flex-col text-xs space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-800 font-medium">
                            {item.quantity}x {item.skuOrProductName}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] uppercase tracking-wider ${
                            item.condition === 'new'
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : item.condition === 'damaged'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {item.condition === 'new' ? 'Neu' : item.condition === 'damaged' ? 'Defekt' : item.condition === 'used' ? 'Gebraucht' : item.condition}
                          </span>
                        </div>
                        {item.notes && (
                          <div className="text-[10px] font-medium text-amber-800 bg-amber-50/50 border border-amber-100 rounded px-1.5 py-0.5 mt-0.5 inline-block w-fit">
                            Notiz: {item.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </td>

                  {/* Action Buttons */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Erstatten Button */}
                      {log.orderId && (
                        <button
                          onClick={() => handleOpenRefund(log)}
                          disabled={isPending || isRefundingPending || log.status === 'bearbeitet'}
                          className={`p-2 rounded-lg transition-all ${
                            log.status === 'bearbeitet'
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                          }`}
                          title={log.status === 'bearbeitet' ? 'Bereits erstattet' : 'Erstattung veranlassen'}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      )}

                      {/* Edit Button */}
                      <button
                        onClick={() => handleOpenEdit(log)}
                        disabled={isPending}
                        className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Daten bearbeiten"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>

                      {/* Trash Button */}
                      <button
                        onClick={() => handleDeleteSingle(log.id)}
                        disabled={isPending}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Eintrag löschen"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {filteredLogs.length > 0 && (
        <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-slate-500">
            Zeige <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> bis <span className="font-medium">{Math.min(currentPage * pageSize, filteredLogs.length)}</span> von <span className="font-medium">{filteredLogs.length}</span> Ergebnissen
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
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
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

      {/* Edit Modal Dialog */}
      {editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-2xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Retouren-Daten anpassen</h3>
                <p className="text-xs text-slate-500 mt-1">Ändere Bestellnummer, Kunde, Lieferadresse und die erfassten Waren.</p>
              </div>
              <button
                onClick={() => setEditingLog(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content Form */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Order Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bestellnummer</label>
                  <input
                    type="text"
                    value={editOrderNumber}
                    onChange={(e) => setEditOrderNumber(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold text-slate-900 bg-white"
                  />
                </div>

                {/* Status Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold text-slate-900 bg-white"
                  >
                    <option value="neu">Neu</option>
                    <option value="bearbeitet">Bearbeitet</option>
                  </select>
                </div>

                {/* Return Date Input */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Datum des Retoureneingangs</label>
                  <input
                    type="datetime-local"
                    value={editReceivedAt}
                    onChange={(e) => setEditReceivedAt(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold text-slate-900 bg-white"
                  />
                </div>

                {/* Scan Date Input */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Scan-Zeitpunkt (System-Log)</label>
                  <input
                    type="datetime-local"
                    value={editScannedAt}
                    disabled
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm font-semibold text-slate-500 bg-slate-50 cursor-not-allowed"
                  />
                </div>

                {/* Marketplace Selection */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Marktplatz</label>
                  <select
                    value={editMarketplace}
                    onChange={(e) => setEditMarketplace(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold text-slate-900 bg-white"
                  >
                    <option value="">Direkt / Unbekannt</option>
                    <option value="Amazon">Amazon</option>
                    <option value="Otto">Otto</option>
                    <option value="Zalando">Zalando</option>
                    {hasKauflandIntegration && <option value="Kaufland">Kaufland</option>}
                    {hasEbayIntegration && <option value="eBay">eBay</option>}
                    <option value="Mirakl">Mirakl</option>
                  </select>
                </div>

                {/* Customer Name */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kundenname</label>
                  <input
                    type="text"
                    value={editCustomerName}
                    onChange={(e) => setEditCustomerName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                  />
                </div>

                {/* Shipping Address */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lieferadresse</label>
                  <textarea
                    rows={2}
                    value={editShippingAddress}
                    onChange={(e) => setEditShippingAddress(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                  />
                </div>

                {/* Notes/Comments */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Interne Notiz (z. B. Erstattungs-Grund)</label>
                  <textarea
                    rows={2}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="z. B. Defekt, keine Erstattung veranlasst da über 30 Tage Rückgabefrist..."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 bg-white"
                  />
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Erfasste Produkte</span>
                  <button
                    onClick={handleAddItem}
                    className="px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1 transition-all"
                  >
                    + Hinzufügen
                  </button>
                </div>

                <div className="space-y-3">
                  {editItems.map((item, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row gap-3 p-3 bg-slate-50 rounded-xl border border-slate-150 relative">
                      {/* Product Name */}
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SKU / Produkt</label>
                        <input
                          type="text"
                          value={item.skuOrProductName}
                          onChange={(e) => handleItemChange(idx, 'skuOrProductName', e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                        />
                      </div>

                      {/* Quantity */}
                      <div className="w-full sm:w-20 space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Menge</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-center text-slate-900"
                        />
                      </div>

                      {/* Condition */}
                      <div className="w-full sm:w-32 space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Zustand</label>
                        <select
                          value={item.condition}
                          onChange={(e) => handleItemChange(idx, 'condition', e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                        >
                          <option value="new">Neu</option>
                          <option value="used">Gebraucht</option>
                          <option value="damaged">Defekt</option>
                        </select>
                      </div>

                      {/* Notes */}
                      <div className="flex-1 min-w-[120px] space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notiz zum Zustand</label>
                        <input
                          type="text"
                          placeholder="z.B. Loch, Fleck"
                          value={item.notes || ''}
                          onChange={(e) => handleItemChange(idx, 'notes', e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                        />
                      </div>

                      {/* Delete Item Button */}
                      <div className="flex items-end justify-end">
                        <button
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all self-end mb-0.5"
                          title="Produkt entfernen"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}

                  {editItems.length === 0 && (
                    <div className="text-center py-6 text-xs text-slate-400 italic bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                      Keine Produkte in dieser Retoure erfasst. Klicke auf + Hinzufügen.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3 justify-end">
              <button
                onClick={() => setEditingLog(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-all"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isPending}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-bold shadow-sm transition-all flex items-center gap-1.5"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal Dialog */}
      {refundingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-3xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Rückerstattung veranlassen</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Veranlasse eine Erstattung für Bestellung <span className="font-bold">{refundingLog.orderNumber}</span>. Es wird eine entsprechende Gutschrift (Credit Note) generiert.
                </p>
              </div>
              <button
                onClick={() => setRefundingLog(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content Form */}
            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
              {/* Quick Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleRefundAllToggle(false)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all"
                >
                  Gelesene Retouren-Mengen laden
                </button>
                <button
                  type="button"
                  onClick={() => handleRefundAllToggle(true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold transition-all"
                >
                  Alles erstatten (Komplett-Storno)
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-4">
                <div className="grid grid-cols-12 gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-100">
                  <div className="col-span-5">Artikel / SKU</div>
                  <div className="col-span-2 text-center">Bestellt</div>
                  <div className="col-span-2 text-center">Eingegangen</div>
                  <div className="col-span-3 text-right">Menge Erstatten</div>
                </div>

                <div className="space-y-3">
                  {refundItemsInput.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center text-xs p-3 bg-slate-50 rounded-xl border border-slate-150">
                      <div className="col-span-5">
                        <div className="font-bold text-slate-900 truncate" title={item.title}>
                          {item.title}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate" title={item.sku}>
                          {item.sku}
                        </div>
                      </div>

                      <div className="col-span-2 text-center text-slate-600 font-bold">
                        {item.orderQty}x
                      </div>

                      <div className="col-span-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          item.returnedQty > 0
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-slate-200/50 text-slate-400'
                        }`}>
                          {item.returnedQty}x
                        </span>
                      </div>

                      <div className="col-span-3 flex justify-end">
                        <input
                          type="number"
                          min="0"
                          max={item.orderQty}
                          value={item.refundQty}
                          onChange={(e) => handleRefundQtyChange(idx, parseInt(e.target.value) || 0)}
                          className="w-16 px-2.5 py-1 text-center rounded-lg border border-slate-250 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3 justify-end">
              <button
                onClick={() => setRefundingLog(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-all"
              >
                Abbrechen
              </button>
              <button
                onClick={handleExecuteRefund}
                disabled={isRefundingPending}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-bold shadow-sm transition-all flex items-center gap-1.5 shadow-md shadow-emerald-100"
              >
                {isRefundingPending ? 'Verarbeite...' : 'Erstattung ausführen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

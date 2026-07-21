'use client'

import React, { useState, useTransition, Fragment, useEffect } from 'react'
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
import { Copy, MoreHorizontal } from 'lucide-react'

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
  user?: { name: string } | null
}

interface ReturnsListProps {
  initialLogs: any[]
  activeMarketplaces?: { id: string; name: string }[]
}

export function ReturnsList({ 
  initialLogs,
  activeMarketplaces = [],
}: ReturnsListProps) {
  const getMarketplaceDisplayName = (mpKey: string | null) => {
    if (!mpKey) return 'Direkt / Unbekannt';
    const lowerKey = mpKey.toLowerCase();
    
    const found = activeMarketplaces.find(m => m.id.toLowerCase() === lowerKey);
    if (found) return found.name;

    if (lowerKey === 'aboutyou') return 'About You';
    if (lowerKey === 'shopify') return 'Shopify';
    if (lowerKey === 'woocommerce') return 'WooCommerce';
    if (lowerKey === 'shopware') return 'Shopware';
    if (lowerKey === 'mirakl_mediamarkt') return 'MediaMarkt';
    if (lowerKey === 'mirakl_decathlon' || lowerKey === 'mirakl_decathlon_eu') return 'Decathlon';
    
    // Auto-capitalize words for things like "decathlon pl" -> "Decathlon PL", "secret sales se" -> "Secret Sales SE"
    return mpKey.split(' ').map(word => {
      if (word.length <= 2 && word.match(/^[a-zA-Z]+$/)) return word.toUpperCase(); // uppercase country codes like "pl", "se", "hu"
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  };

  const marketplaceOptions = React.useMemo(() => {
    const mpMap = new Map<string, { value: string, label: string }>();
    
    mpMap.set('amazon', { value: 'Amazon', label: 'Amazon' });
    mpMap.set('otto', { value: 'Otto', label: 'Otto' });
    mpMap.set('zalando', { value: 'Zalando', label: 'Zalando' });
    
    activeMarketplaces.forEach(mp => {
      const rawKey = mp.name.toLowerCase();
      const key = rawKey.replace(/\s+/g, '');
      if (!mpMap.has(key)) {
        mpMap.set(key, { value: mp.name, label: mp.name });
      }
    });
    
    initialLogs.forEach(log => {
      if (log.marketplace) {
        const rawKey = log.marketplace.toLowerCase();
        const key = rawKey.replace(/\s+/g, '');
        // Skip shipping providers that might have been mistakenly tracked as marketplaces
        if (key === 'dhl' || key === 'hermes' || key === 'dpd' || key === 'gls' || key === 'ups') return;
        
        // Deduplicate by normalizing names that are essentially the same (like "decathlon pl" vs "mirakl_decathlon")
        // We use space-stripped lowerKey to match things like 'About You' and 'aboutyou'
        if (!mpMap.has(key)) {
          mpMap.set(key, { value: log.marketplace, label: getMarketplaceDisplayName(log.marketplace) });
        }
      }
    });
    
    return Array.from(mpMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [activeMarketplaces, initialLogs]);

  const [logs, setLogs] = useState<ReturnLog[]>(
    initialLogs.map((l) => {
      let displayOrderNumber = l.orderNumber
      if (l.marketplace?.toLowerCase() === 'otto' && l.order?.rawPayload?.orderNumber) {
        displayOrderNumber = l.order.rawPayload.orderNumber
      }

      return {
        ...l,
        orderNumber: displayOrderNumber,
        scannedAt: new Date(l.scannedAt),
        receivedAt: l.receivedAt ? new Date(l.receivedAt) : new Date(l.scannedAt),
        items: l.items || []
      }
    })
  )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'neu' | 'bearbeitet' | 'in_klaerung'>('neu')
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all')
  const [isPending, startTransition] = useTransition()
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }

  // Dropdown State
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.action-dropdown-container')) {
        setOpenDropdownId(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

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

  // Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(current => current?.message === message ? null : current)
    }, 5000)
  }

  // Refund Modal State
  const [refundingLog, setRefundingLog] = useState<ReturnLog | null>(null)
  const [refundItemsInput, setRefundItemsInput] = useState<{ sku: string; title: string; orderQty: number; returnedQty: number; refundQty: number; restock: boolean }[]>([])
  const [isRefundingPending, startRefundTransition] = useTransition()

  // Expandable Order Details State
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const [orderDetailsCache, setOrderDetailsCache] = useState<Record<string, any>>({})
  const [isLoadingOrderDetails, setIsLoadingOrderDetails] = useState<Record<string, boolean>>({})

  const handleToggleExpand = async (log: ReturnLog) => {
    if (expandedLogId === log.id) {
      setExpandedLogId(null)
      return
    }
    
    if (!log.orderId) return
    
    setExpandedLogId(log.id)
    
    if (!orderDetailsCache[log.id]) {
      setIsLoadingOrderDetails(prev => ({ ...prev, [log.id]: true }))
      try {
        const details = await getOrderDetailsAction(log.orderId)
        setOrderDetailsCache(prev => ({ ...prev, [log.id]: details }))
      } catch (err) {
        console.error('Failed to load order details:', err)
      } finally {
        setIsLoadingOrderDetails(prev => ({ ...prev, [log.id]: false }))
      }
    }
  }

  const handleOpenRefund = async (log: ReturnLog) => {
    const orderId = log.orderId
    if (!orderId) return
    startRefundTransition(async () => {
      try {
        const orderDetails = await getOrderDetailsAction(orderId)
        
        // Cache the order details so the modal can display order notes
        setOrderDetailsCache(prev => ({ ...prev, [log.id]: orderDetails }))
        
        // Match order items with returned items
        const inputs = orderDetails.items.map((orderItem: any) => {
          const orderSku = (orderItem.sku || '').toLowerCase()
          const matchingScannedItem = log.items.find(item => {
            const scannedSku = (item.skuOrProductName || '').toLowerCase()
            if (scannedSku === orderSku) return true
            // Handle common OCR mistakes (l vs 1, O vs 0)
            const normalize = (s: string) => s.replace(/[l1i]/g, '1').replace(/[o0]/g, '0')
            return normalize(scannedSku) === normalize(orderSku)
          })
          const returnedQty = matchingScannedItem ? matchingScannedItem.quantity : 0
          const condition = matchingScannedItem?.condition || 'new'
          const isNew = condition.toLowerCase() === 'new' || condition.toLowerCase() === 'neu'
          
          return {
            sku: orderItem.sku || 'N/A',
            title: orderItem.title,
            orderQty: parseInt(orderItem.quantity) || 1,
            returnedQty,
            refundQty: returnedQty, // default to the returned quantity
            restock: isNew
          }
        })
        
        setRefundItemsInput(inputs)
        setRefundingLog(log)
      } catch (err: any) {
        showToast(err.message || 'Fehler beim Laden der Bestelldaten.', 'error')
      }
    })
  }

  const handleRefundQtyChange = (index: number, val: number) => {
    const next = [...refundItemsInput]
    next[index].refundQty = Math.max(0, Math.min(next[index].orderQty, val))
    setRefundItemsInput(next)
  }

  const handleRestockToggle = (index: number, val: boolean) => {
    const next = [...refundItemsInput]
    next[index].restock = val
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
    const payload = refundItemsInput.filter(item => item.refundQty > 0).map(item => ({ sku: item.sku, quantity: item.refundQty, restock: item.restock }))
    if (payload.length === 0) {
      showToast('Bitte wähle mindestens einen Artikel mit einer Menge größer als 0 aus.', 'error')
      return
    }

    startRefundTransition(async () => {
      try {
        const res = await refundReturnAction(refundingLog.id, payload)
        if (res.success && 'creditNoteNumber' in res) {
          showToast(`Erstattung erfolgreich veranlasst (Gutschrift: ${res.creditNoteNumber}).`, 'success')
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
        } else if (!res.success && 'error' in res) {
          showToast(res.error || 'Fehler bei der Rückerstattung.', 'error')
        } else {
          showToast('Ein unbekannter Fehler ist aufgetreten.', 'error')
        }
      } catch (err: any) {
        showToast(err.message || 'Fehler bei der Rückerstattung.', 'error')
      }
    })
  }

  // Search & Filter
  const filteredLogs = logs.filter((log) => {
    const q = searchTerm.trim().toLowerCase()
    const matchesSearch =
      log.orderNumber.toLowerCase().includes(q) ||
      (log.customerName || '').toLowerCase().includes(q) ||
      (log.notes || '').toLowerCase().includes(q) ||
      (log.metadata?.tracking_number || '').toLowerCase().includes(q)
    
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter
    
    let matchesMarketplace = false;
    if (marketplaceFilter === 'all') {
      matchesMarketplace = true;
    } else if (marketplaceFilter === 'direct' && !log.marketplace) {
      matchesMarketplace = true;
    } else if (marketplaceFilter.startsWith('group_')) {
      const label = getMarketplaceDisplayName(log.marketplace);
      const directNames = ['Amazon', 'Otto', 'Zalando', 'Kaufland', 'eBay', 'About You', 'Shopify', 'WooCommerce', 'Shopware'];
      if (marketplaceFilter === 'group_direct') {
        matchesMarketplace = directNames.includes(label);
      } else if (marketplaceFilter === 'group_decathlon') {
        matchesMarketplace = label.startsWith('Decathlon');
      } else if (marketplaceFilter === 'group_secret_sales') {
        matchesMarketplace = label.startsWith('Secret Sales');
      } else if (marketplaceFilter === 'group_other') {
        matchesMarketplace = !directNames.includes(label) && !label.startsWith('Decathlon') && !label.startsWith('Secret Sales');
      }
    } else {
      matchesMarketplace = log.marketplace?.toLowerCase() === marketplaceFilter.toLowerCase();
    }

    return matchesSearch && matchesStatus && matchesMarketplace
  })

  // Apply Sorting
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    if (!sortConfig) return 0;
    
    let aValue: any = a[sortConfig.key as keyof ReturnLog];
    let bValue: any = b[sortConfig.key as keyof ReturnLog];

    if (sortConfig.key === 'user') {
      aValue = a.user?.name || '';
      bValue = b.user?.name || '';
    } else if (sortConfig.key === 'scannedAt' || sortConfig.key === 'receivedAt') {
      aValue = aValue ? new Date(aValue).getTime() : 0;
      bValue = bValue ? new Date(bValue).getTime() : 0;
    } else if (sortConfig.key === 'refunded_at') {
      aValue = (a.metadata as any)?.refunded_at ? new Date((a.metadata as any).refunded_at).getTime() : 0;
      bValue = (b.metadata as any)?.refunded_at ? new Date((b.metadata as any).refunded_at).getTime() : 0;
    } else if (sortConfig.key === 'marketplace') {
      aValue = getMarketplaceDisplayName(aValue);
      bValue = getMarketplaceDisplayName(bValue);
    } else {
      aValue = aValue || '';
      bValue = bValue || '';
    }

    if (aValue < bValue) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  // Pagination Logic
  const totalPages = Math.ceil(sortedLogs.length / pageSize)
  const paginatedLogs = sortedLogs.slice(
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
        showToast('Fehler beim Löschen.', 'error')
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
        showToast('Fehler beim Massen-Löschen.', 'error')
      }
    })
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    startTransition(async () => {
      try {
        await updateReturnStatusAction(id, newStatus)
        setLogs((prev) =>
          prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l))
        )
      } catch (err) {
        showToast('Fehler beim Ändern des Status.', 'error')
      }
    })
  }

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    let newStatus = 'neu'
    if (currentStatus === 'neu') newStatus = 'in_klaerung'
    else if (currentStatus === 'in_klaerung') newStatus = 'bearbeitet'
    
    await handleStatusChange(id, newStatus)
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
        showToast('Fehler beim Massen-Status-Änderung.', 'error')
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
    const foundOption = log.marketplace ? marketplaceOptions.find(opt => opt.value.toLowerCase() === log.marketplace!.toLowerCase()) : null;
    setEditMarketplace(foundOption ? foundOption.value : (log.marketplace || ''))
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
      showToast(process.env.NEXT_PUBLIC_APP_VARIANT === 'craft' ? 'Auftragsnummer darf nicht leer sein.' : 'Bestellnummer darf nicht leer sein.', 'error')
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

        const res = await updateReturnAction(editingLog.id, payload)

        // Update local state
        setLogs((prev) =>
          prev.map((l) => {
            if (l.id === editingLog.id) {
              return {
                ...l,
                orderNumber: payload.orderNumber,
                orderId: res.orderId,
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
        showToast('Fehler beim Speichern der Änderungen.', 'error')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex-1 w-full md:max-w-md flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={process.env.NEXT_PUBLIC_APP_VARIANT === 'craft' ? "Auftragsnr., Kunde, Notiz suchen..." : "Bestellnr., Kunde, Notiz suchen..."}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full pl-10 pr-10 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm text-slate-900 font-medium placeholder:text-slate-500 transition-all"
            />
            <svg className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            type="button"
            className="px-5 py-2 w-full sm:w-auto bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
          >
            Suchen
          </button>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {/* Marketplace Filter */}
          <select
            value={marketplaceFilter}
            onChange={(e) => {
              setMarketplaceFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm text-slate-900 font-medium"
          >
            <option value="all">Alle Kanäle</option>
            <option value="direct">Direkt / Kein Marktplatz</option>
            
            {(() => {
              const direct: {value: string, label: string}[] = [];
              const decathlon: {value: string, label: string}[] = [];
              const secretSales: {value: string, label: string}[] = [];
              const other: {value: string, label: string}[] = [];
              
              const directNames = ['Amazon', 'Otto', 'Zalando', 'Kaufland', 'eBay', 'About You', 'Shopify', 'WooCommerce', 'Shopware'];
              
              marketplaceOptions.forEach(opt => {
                if (directNames.includes(opt.label)) {
                  direct.push(opt);
                } else if (opt.label.startsWith('Decathlon')) {
                  decathlon.push(opt);
                } else if (opt.label.startsWith('Secret Sales')) {
                  secretSales.push(opt);
                } else {
                  other.push(opt);
                }
              });

              return (
                <>
                  {direct.length > 0 && (
                    <>
                      <option value="group_direct" className="font-semibold bg-gray-50">Direkte Integrationen</option>
                      {direct.map(opt => <option key={opt.value} value={opt.value}>&nbsp;&nbsp;{opt.label}</option>)}
                    </>
                  )}
                  {decathlon.length > 0 && (
                    <>
                      <option value="group_decathlon" className="font-semibold bg-gray-50">Decathlon Marktplätze</option>
                      {decathlon.map(opt => <option key={opt.value} value={opt.value}>&nbsp;&nbsp;{opt.label}</option>)}
                    </>
                  )}
                  {secretSales.length > 0 && (
                    <>
                      <option value="group_secret_sales" className="font-semibold bg-gray-50">Secret Sales Marktplätze</option>
                      {secretSales.map(opt => <option key={opt.value} value={opt.value}>&nbsp;&nbsp;{opt.label}</option>)}
                    </>
                  )}
                  {other.length > 0 && (
                    <>
                      <option value="group_other" className="font-semibold bg-gray-50">Weitere Marktplätze</option>
                      {other.map(opt => <option key={opt.value} value={opt.value}>&nbsp;&nbsp;{opt.label}</option>)}
                    </>
                  )}
                </>
              );
            })()}
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
            <button
              onClick={() => {
                setStatusFilter('in_klaerung')
                setCurrentPage(1)
              }}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                statusFilter === 'in_klaerung'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              In Klärung
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
              onClick={() => handleBulkStatusChange('in_klaerung')}
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 text-xs font-bold transition-all disabled:opacity-50"
            >
              In Klärung
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
              {[
                { label: 'Status', key: 'status' },
                { label: 'Erstattet am', key: 'refunded_at' },
                { label: 'Eingang', key: 'receivedAt' },
                { label: 'Scan-Zeitpunkt', key: 'scannedAt' },
                { label: 'Mitarbeiter', key: 'user' },
                { label: 'Marktplatz', key: 'marketplace' },
                { label: process.env.NEXT_PUBLIC_APP_VARIANT === 'craft' ? 'Auftragsnummer' : 'Bestellnummer', key: 'orderNumber' },
                { label: 'Versand', key: 'shippingAddress' }, // Use shippingAddress as placeholder for Versand sorting if needed
                { label: 'Kunde & Notiz', key: 'customerName' },
              ].map(({ label, key }) => (
                <th 
                  key={key}
                  className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none group"
                  onClick={() => handleSort(key)}
                >
                  <div className="flex items-center gap-1">
                    {label}
                    <span className="text-slate-300 group-hover:text-slate-400">
                      {sortConfig?.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </div>
                </th>
              ))}
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Artikel / Zustand</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-6 py-12 text-center text-slate-400 italic">
                  Keine Retouren gefunden.
                </td>
              </tr>
            ) : (
              paginatedLogs.map((log, index) => (
                <Fragment key={log.id}>
                  <tr 
                  className={`hover:bg-slate-50 transition-colors group cursor-pointer ${expandedLogId === log.id ? 'bg-gray-50' : 'bg-white'}`}
                  onClick={() => handleToggleExpand(log)}
                >
                  {/* Checkbox */}
                  <td className="px-6 py-4 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(log.id)}
                      onChange={(e) => { e.stopPropagation(); handleSelectOne(log.id) }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                  </td>

                  {/* Status Toggle */}
                  <td className="px-6 py-4">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStatusToggle(log.id, log.status) }}
                      disabled={isPending}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer select-none ${
                        log.status === 'bearbeitet'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : log.status === 'in_klaerung'
                          ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                      }`}
                      title="Klicken, um den Status zu wechseln"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'bearbeitet' ? 'bg-emerald-500' : log.status === 'in_klaerung' ? 'bg-amber-500' : 'bg-indigo-500'}`} />
                      {log.status === 'bearbeitet' ? 'Bearbeitet' : log.status === 'in_klaerung' ? 'In Klärung' : 'Neu'}
                    </button>
                  </td>

                  {/* Erstattet am */}
                  <td className="px-6 py-4">
                    {log.status === 'bearbeitet' && (log.metadata as any)?.refunded_at ? (
                      <div className="text-xs font-bold text-emerald-700 flex items-center gap-1.5" title="Erstattungszeitpunkt">
                        <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{format(new Date((log.metadata as any).refunded_at), 'dd.MM.yy HH:mm', { locale: de })}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">-</span>
                    )}
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

                  {/* Mitarbeiter */}
                  <td className="px-6 py-4">
                    {log.user?.name ? (
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {log.user.name}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Unbekannt</span>
                    )}
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
                        {getMarketplaceDisplayName(log.marketplace)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Direkt / Unbekannt</span>
                    )}
                  </td>

                  {/* Order ID */}
                  <td className="px-6 py-4 group/bestell">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-slate-900">{log.orderNumber}</div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(log.orderNumber)
                          showToast('Bestellnummer kopiert', 'success')
                        }}
                        className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover/bestell:opacity-100 transition-all focus:opacity-100"
                        title="Bestellnummer kopieren"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    {log.orderId ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleExpand(log) }}
                        className="inline-flex items-center text-[10px] font-bold text-emerald-600 mt-0.5 hover:text-emerald-700 transition-colors cursor-pointer outline-none"
                        title="Bestelldetails anzeigen"
                      >
                        ● Zugeordnet
                        <svg className={`w-3.5 h-3.5 ml-1 transition-transform ${expandedLogId === log.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
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
                              : item.condition === 'fremd'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {item.condition === 'new' ? 'Neu' : item.condition === 'damaged' ? 'Defekt' : item.condition === 'used' ? 'Gebraucht' : item.condition === 'fremd' ? 'Fremdware' : item.condition}
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
                      {/* Erstatten Button (Outside Menu) */}
                      {log.orderId && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenRefund(log) }}
                          disabled={isPending || isRefundingPending}
                          className={`p-2 rounded-lg transition-all text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50`}
                          title="Weitere Erstattung veranlassen"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      )}

                      <div className="relative inline-block text-left action-dropdown-container">
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === log.id ? null : log.id) }}
                          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all outline-none focus:outline-none border-none"
                          title="Aktionen"
                        >
                          <MoreHorizontal className="w-5 h-5" />
                        </button>
                      
                      {openDropdownId === log.id && (
                        <div className={`absolute right-0 w-48 bg-white rounded-md shadow-lg border border-slate-200 z-50 py-1 ${paginatedLogs.length > 3 && index >= paginatedLogs.length - 2 ? 'bottom-full mb-2' : 'mt-2'}`}>
                          {log.orderId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenDropdownId(null)
                                handleOpenRefund(log)
                              }}
                              disabled={isPending || isRefundingPending}
                              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-emerald-600 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Erstatten
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenDropdownId(null)
                              handleOpenEdit(log)
                            }}
                            disabled={isPending}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Bearbeiten
                          </button>

                          <div className="h-px bg-slate-100 my-1" />

                          {log.status !== 'neu' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenDropdownId(null)
                                handleStatusChange(log.id, 'neu')
                              }}
                              disabled={isPending}
                              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Status: Neu
                            </button>
                          )}
                          {log.status !== 'in_klaerung' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenDropdownId(null)
                                handleStatusChange(log.id, 'in_klaerung')
                              }}
                              disabled={isPending}
                              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Status: In Klärung
                            </button>
                          )}
                          {log.status !== 'bearbeitet' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenDropdownId(null)
                                handleStatusChange(log.id, 'bearbeitet')
                              }}
                              disabled={isPending}
                              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-emerald-600 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                              </svg>
                              Status: Bearbeitet
                            </button>
                          )}

                          <div className="h-px bg-slate-100 my-1" />

                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenDropdownId(null)
                              handleDeleteSingle(log.id)
                            }}
                            disabled={isPending}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Löschen
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                </tr>
                
                {expandedLogId === log.id && (
                  <tr className="bg-gray-50 border-t border-b border-gray-100">
                    <td colSpan={11} className="px-6 py-6 animate-fade-in">
                      <div className="w-full">
                        {isLoadingOrderDetails[log.id] ? (
                          <div className="text-sm text-slate-500 flex items-center justify-center py-4">
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Lade Bestelldetails...
                          </div>
                        ) : orderDetailsCache[log.id] ? (
                          <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Bestelldetails ({orderDetailsCache[log.id].marketplaceOrderId})</h4>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 text-sm">
                              <div className="md:col-span-3">
                                <div className="font-semibold text-slate-500 text-xs uppercase tracking-wider mb-2">Kunde & Versand</div>
                                <div className="text-slate-700">
                                  <div className="font-medium">{orderDetailsCache[log.id].shippingName || orderDetailsCache[log.id].buyerName}</div>
                                  <div>{orderDetailsCache[log.id].shippingStreet}</div>
                                  <div>{orderDetailsCache[log.id].shippingZip} {orderDetailsCache[log.id].shippingCity}</div>
                                  <div>{orderDetailsCache[log.id].shippingCountry}</div>
                                </div>
                              </div>
                              <div className="md:col-span-3">
                                <div className="font-semibold text-slate-500 text-xs uppercase tracking-wider mb-2">Zahlung</div>
                                <div className="text-slate-700 space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Zwischensumme:</span>
                                    <span>{Number(orderDetailsCache[log.id].subtotalAmount || 0).toFixed(2)} {orderDetailsCache[log.id].currency}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Steuern:</span>
                                    <span>{Number(orderDetailsCache[log.id].taxAmount || 0).toFixed(2)} {orderDetailsCache[log.id].currency}</span>
                                  </div>
                                  <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-100 mt-1">
                                    <span>Gesamt:</span>
                                    <span>{Number(orderDetailsCache[log.id].totalAmount || 0).toFixed(2)} {orderDetailsCache[log.id].currency}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="md:col-span-6">
                                <div className="font-semibold text-slate-500 text-xs uppercase tracking-wider mb-2">Artikel in Bestellung</div>
                                <ul className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                  {orderDetailsCache[log.id].items?.map((item: any, idx: number) => {
                                    const returnedItem = log.items?.find(
                                      (logItem: any) => logItem.skuOrProductName.toLowerCase() === item.sku?.toLowerCase()
                                    )
                                    const isRefunded = !!returnedItem
                                    const returnedQty = returnedItem?.quantity || 0

                                    return (
                                      <li key={idx} className={`flex flex-col border-b border-slate-200 pb-2 last:border-0 last:pb-0 ${isRefunded ? (log.status === 'bearbeitet' ? 'bg-emerald-100/50' : 'bg-blue-50') + ' -mx-2 px-2 pt-2 rounded-md' : 'pt-2'}`}>
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="font-medium text-slate-800 line-clamp-1" title={item.title}>{item.title}</div>
                                          {isRefunded && (
                                            <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${log.status === 'bearbeitet' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                                              {returnedQty > 0 
                                                ? `${returnedQty}x ${log.status === 'bearbeitet' ? 'Erstattet' : 'Retourniert'}` 
                                                : (log.status === 'bearbeitet' ? 'Erstattet' : 'Retourniert')}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                                          <span>SKU: {item.sku || 'N/A'}</span>
                                          <span>{item.quantity}x á {Number(item.unitPrice || 0).toFixed(2)} {orderDetailsCache[log.id].currency}</span>
                                        </div>
                                      </li>
                                    )
                                  })}
                                </ul>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-red-500 py-4 text-center">
                            Details konnten nicht geladen werden.
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
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
                <p className="text-xs text-slate-500 mt-1">Ändere {process.env.NEXT_PUBLIC_APP_VARIANT === 'craft' ? 'Auftragsnummer' : 'Bestellnummer'}, Kunde, Lieferadresse und die erfassten Waren.</p>
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
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{process.env.NEXT_PUBLIC_APP_VARIANT === 'craft' ? 'Auftragsnummer' : 'Bestellnummer'}</label>
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
                    <option value="in_klaerung">In Klärung</option>
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
                    {(() => {
                      const direct: {value: string, label: string}[] = [];
                      const decathlon: {value: string, label: string}[] = [];
                      const secretSales: {value: string, label: string}[] = [];
                      const other: {value: string, label: string}[] = [];
                      
                      const directNames = ['Amazon', 'Otto', 'Zalando', 'Kaufland', 'eBay', 'About You', 'Shopify', 'WooCommerce', 'Shopware'];
                      
                      marketplaceOptions.forEach(opt => {
                        if (directNames.includes(opt.label)) {
                          direct.push(opt);
                        } else if (opt.label.startsWith('Decathlon')) {
                          decathlon.push(opt);
                        } else if (opt.label.startsWith('Secret Sales')) {
                          secretSales.push(opt);
                        } else {
                          other.push(opt);
                        }
                      });

                      return (
                        <>
                          {direct.length > 0 && (
                            <>
                              <option value="group_direct" className="font-semibold bg-gray-50" disabled>Direkte Integrationen</option>
                              {direct.map(opt => <option key={opt.value} value={opt.value}>&nbsp;&nbsp;{opt.label}</option>)}
                            </>
                          )}
                          {decathlon.length > 0 && (
                            <>
                              <option value="group_decathlon" className="font-semibold bg-gray-50" disabled>Decathlon Marktplätze</option>
                              {decathlon.map(opt => <option key={opt.value} value={opt.value}>&nbsp;&nbsp;{opt.label}</option>)}
                            </>
                          )}
                          {secretSales.length > 0 && (
                            <>
                              <option value="group_secret_sales" className="font-semibold bg-gray-50" disabled>Secret Sales Marktplätze</option>
                              {secretSales.map(opt => <option key={opt.value} value={opt.value}>&nbsp;&nbsp;{opt.label}</option>)}
                            </>
                          )}
                          {other.length > 0 && (
                            <>
                              <option value="group_other" className="font-semibold bg-gray-50" disabled>Weitere Marktplätze</option>
                              {other.map(opt => <option key={opt.value} value={opt.value}>&nbsp;&nbsp;{opt.label}</option>)}
                            </>
                          )}
                        </>
                      );
                    })()}
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
                          <option value="fremd">Fremdware</option>
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
              
              {/* Internal Order Note Alert */}
              {orderDetailsCache[refundingLog.id]?.notes && (
                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-xl flex items-start gap-3 shadow-sm mb-2">
                  <div className="bg-amber-100 p-2 rounded-lg shrink-0">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-900">Achtung: Interne Notiz zur Bestellung liegt vor!</h4>
                    <p className="text-sm text-amber-800 mt-1 whitespace-pre-wrap">{orderDetailsCache[refundingLog.id].notes}</p>
                  </div>
                </div>
              )}

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

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-xl z-50 flex items-center gap-3 animate-fade-in-up transition-all border ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 
          toast.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 
          'bg-indigo-50 border-indigo-200 text-indigo-800'
        }`}>
          {toast.type === 'success' ? (
            <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
          ) : toast.type === 'error' ? (
            <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          ) : (
            <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          )}
          <span className="font-semibold text-sm">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-4 text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      )}
    </div>
  )
}

'use client'

import React, { useState, useEffect } from 'react'
import { splitOrderAction } from '@/app/actions/orders'
import { Scissors, Calendar, Clock, AlertCircle, ArrowRight, Check, X, Loader2 } from 'lucide-react'

interface SplitOrderModalProps {
  order: any
  isOpen: boolean
  onClose: () => void
  onSuccess: (result: {
    message: string
    originalOrderNumber?: string
    newOrderNumber?: string
    newOrderId?: string | null
  }) => void
}

export function SplitOrderModal({ order, isOpen, onClose, onSuccess }: SplitOrderModalProps) {
  const [splitQuantities, setSplitQuantities] = useState<Record<string, number>>({})
  const [newOrderStatus, setNewOrderStatus] = useState<'pending' | 'later_shipment'>('pending')
  const [scheduledDate, setScheduledDate] = useState<string>('')
  const [splitNote, setSplitNote] = useState<string>('Vorbestellung - Teillieferung 2')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize quantities when order changes or modal opens
  useEffect(() => {
    if (order && order.items) {
      const initial: Record<string, number> = {}
      // If there are 2 or more items, default the 2nd item to split=its quantity as an intuitive starting point
      order.items.forEach((item: any, idx: number) => {
        if (order.items.length > 1 && idx === 1) {
          initial[item.id] = Number(item.quantity) || 1
        } else {
          initial[item.id] = 0
        }
      })
      setSplitQuantities(initial)
      setNewOrderStatus('pending')
      setScheduledDate('')
      setSplitNote('Vorbestellung - Teillieferung 2')
      setError(null)
    }
  }, [order, isOpen])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSubmitting, onClose])

  if (!isOpen || !order) return null

  const items = order.items || []

  const updateSplitQuantity = (itemId: string, qty: number) => {
    const item = items.find((i: any) => i.id === itemId)
    const max = item ? Number(item.quantity) || 1 : 1
    const clamped = Math.max(0, Math.min(max, qty))
    setSplitQuantities(prev => ({ ...prev, [itemId]: clamped }))
    setError(null)
  }

  // Calculate totals
  let totalRemainingQty = 0
  let totalSplitQty = 0
  let remSubtotal = 0
  let splitSubtotal = 0

  items.forEach((item: any) => {
    const originalQty = Number(item.quantity) || 1
    const splitQty = splitQuantities[item.id] || 0
    const remQty = Math.max(0, originalQty - splitQty)
    const unitPrice = Number(item.unitPrice) || 0
    const taxRate = Number(item.taxRate) || 0.19
    const grossPrice = unitPrice * (1 + taxRate)

    totalRemainingQty += remQty
    totalSplitQty += splitQty

    remSubtotal += remQty * grossPrice
    splitSubtotal += splitQty * grossPrice
  })

  const isValid = totalSplitQty > 0 && totalRemainingQty > 0

  const baseOrderId = order.marketplaceOrderId?.replace(/-\d+$/, '') || order.marketplaceOrderId

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) {
      if (totalSplitQty <= 0) {
        setError('Bitte wähle mindestens ein Produkt mit einer Menge größer als 0 für die Teillieferung aus.')
      } else {
        setError('Mindestens ein Artikel muss in der bestehenden Lieferung verbleiben.')
      }
      return
    }

    if (newOrderStatus === 'later_shipment' && !scheduledDate) {
      setError('Bitte wähle ein geplantes Versanddatum für den späteren Versand aus.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const itemsPayload = Object.entries(splitQuantities)
        .filter(([_, qty]) => qty > 0)
        .map(([itemId, qty]) => ({
          itemId,
          splitQuantity: qty
        }))

      const result = await splitOrderAction(
        order.id,
        itemsPayload,
        newOrderStatus,
        newOrderStatus === 'later_shipment' ? scheduledDate : null,
        splitNote
      )

      if (result.error) {
        setError(result.error)
        setIsSubmitting(false)
      } else {
        onSuccess({
          message: result.message || 'Bestellung erfolgreich aufgeteilt.',
          originalOrderNumber: result.originalOrderNumber,
          newOrderNumber: result.newOrderNumber,
          newOrderId: result.newOrderId
        })
        onClose()
      }
    } catch (err: any) {
      console.error('Error submitting split:', err)
      setError(err?.message || 'Ein unerwarteter Fehler ist aufgetreten.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={() => !isSubmitting && onClose()} 
      />

      {/* Modal Dialog */}
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="split-order-title"
        className="relative bg-white border border-slate-200/80 rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-indigo-50/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
              <Scissors className="w-5 h-5 rotate-90" />
            </div>
            <div>
              <h3 id="split-order-title" className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Bestellung aufteilen (Splittversand)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Bestellung <span className="font-mono font-semibold text-slate-700">{order.marketplaceOrderId}</span> in Teillieferungen aufteilen
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !isSubmitting && onClose()}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-xl transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="px-6 py-3 bg-amber-50/70 border-b border-amber-200/60 flex items-start gap-2.5 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            Verteile die Produkte auf zwei Lieferungen. Die verbleibenden Artikel können <strong>sofort versendet</strong> werden, während die neue Teillieferung (z.&nbsp;B. eine Vorbestellung) auf <strong>Pending</strong> oder <strong>späterer Versand</strong> gesetzt wird.
          </p>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Section: Products to split */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Produkte &amp; Mengen aufteilen
              </label>
              <span className="text-xs text-slate-500">
                {items.length} {items.length === 1 ? 'Artikel' : 'Artikel'} in Bestellung
              </span>
            </div>

            <div className="space-y-3">
              {items.map((item: any) => {
                const origQty = Number(item.quantity) || 1
                const splitQty = splitQuantities[item.id] || 0
                const remQty = origQty - splitQty
                const unitPrice = Number(item.unitPrice) || 0
                const taxRate = Number(item.taxRate) || 0.19
                const grossUnitPrice = unitPrice * (1 + taxRate)

                return (
                  <div 
                    key={item.id} 
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-800 font-mono">
                            {origQty}x Gesamt
                          </span>
                          <span className="text-xs font-mono text-slate-500 truncate">
                            SKU: {item.sku || 'N/A'}
                          </span>
                        </div>
                        <h4 className="text-sm font-medium text-slate-900 mt-1 line-clamp-2" title={item.title}>
                          {item.title}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {new Intl.NumberFormat('de-DE', { style: 'currency', currency: order.currency || 'EUR' }).format(grossUnitPrice)} / Stk.
                        </p>
                      </div>

                      {/* Quantity Stepper for Teillieferung 2 */}
                      <div className="flex sm:flex-col items-end sm:items-end justify-between gap-2 shrink-0">
                        <div className="text-right">
                          <span className="text-[11px] font-medium text-slate-500 block mb-1">
                            In neue Teillieferung:
                          </span>
                          <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-sm">
                            <button
                              type="button"
                              onClick={() => updateSplitQuantity(item.id, splitQty - 1)}
                              disabled={splitQty <= 0 || isSubmitting}
                              className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white transition-colors"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={origQty}
                              value={splitQty}
                              onChange={(e) => updateSplitQuantity(item.id, parseInt(e.target.value || '0', 10))}
                              disabled={isSubmitting}
                              className="w-12 text-center text-sm font-bold text-slate-900 placeholder:text-slate-500 bg-transparent border-0 focus:ring-0 p-0"
                            />
                            <button
                              type="button"
                              onClick={() => updateSplitQuantity(item.id, splitQty + 1)}
                              disabled={splitQty >= origQty || isSubmitting}
                              className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Quick action buttons */}
                        <div className="flex items-center gap-1.5 text-[11px]">
                          {origQty > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={() => updateSplitQuantity(item.id, 0)}
                                className={`text-slate-500 hover:text-slate-800 underline transition-colors ${splitQty === 0 ? 'font-bold text-indigo-600' : ''}`}
                              >
                                0
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => updateSplitQuantity(item.id, origQty)}
                                className={`text-slate-500 hover:text-slate-800 underline transition-colors ${splitQty === origQty ? 'font-bold text-indigo-600' : ''}`}
                              >
                                Alle ({origQty})
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Distribution visual badge */}
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Verteilung:</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${remQty > 0 ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-500'}`}>
                          Teil 1: {remQty}x
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${splitQty > 0 ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-500'}`}>
                          Teil 2: {splitQty}x
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section: Split order settings (Status & Note) */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Status für neue Teillieferung (Teil 2)
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setNewOrderStatus('pending')}
                  className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                    newOrderStatus === 'pending'
                      ? 'border-indigo-600 bg-white shadow-sm ring-2 ring-indigo-600/10'
                      : 'border-slate-200 bg-white/60 hover:bg-white text-slate-700'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    newOrderStatus === 'pending' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      Pending (Ausstehend)
                      {newOrderStatus === 'pending' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                      Bleibt unversendet auf Pending, bis die Ware vorrätig ist.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setNewOrderStatus('later_shipment')}
                  className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                    newOrderStatus === 'later_shipment'
                      ? 'border-purple-600 bg-white shadow-sm ring-2 ring-purple-600/10'
                      : 'border-slate-200 bg-white/60 hover:bg-white text-slate-700'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    newOrderStatus === 'later_shipment' ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      Späterer Versand
                      {newOrderStatus === 'later_shipment' && <Check className="w-3.5 h-3.5 text-purple-600" />}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                      Vorbestellung mit geplantem Liefertermin.
                    </p>
                  </div>
                </button>
              </div>

              {/* Date picker for later_shipment */}
              {newOrderStatus === 'later_shipment' && (
                <div className="mt-3 p-3 bg-white rounded-lg border border-purple-200 animate-in fade-in slide-in-from-top-1">
                  <label htmlFor="scheduled-date-input" className="block text-xs font-semibold text-slate-800 mb-1">
                    Voraussichtlicher Versandtermin / Wareneingang:
                  </label>
                  <input
                    id="scheduled-date-input"
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full sm:w-64 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              )}
            </div>

            {/* Note input */}
            <div>
              <label htmlFor="split-note-input" className="block text-xs font-semibold text-slate-700 mb-1">
                Notiz / interner Vermerk für neue Teillieferung:
              </label>
              <input
                id="split-note-input"
                type="text"
                value={splitNote}
                onChange={(e) => setSplitNote(e.target.value)}
                placeholder="z. B. Vorbestellung - Teillieferung 2"
                className="w-full px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Live Summary Box */}
          <div className="bg-slate-100/80 rounded-xl p-4 border border-slate-200/80">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
              Ergebnis nach Aufteilung:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 font-mono">
                    {baseOrderId}-1
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Teillieferung 1
                  </span>
                </div>
                <div className="text-xs text-slate-600 mt-2 space-y-0.5">
                  <div>Menge: <strong className="text-slate-900">{totalRemainingQty} Stück</strong></div>
                  <div>Betrag: <strong>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: order.currency || 'EUR' }).format(remSubtotal)}</strong></div>
                  <div className="text-[11px] text-emerald-700 font-medium">✓ Sofort versandbereit</div>
                </div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 font-mono">
                    {baseOrderId}-2
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                    Teillieferung 2
                  </span>
                </div>
                <div className="text-xs text-slate-600 mt-2 space-y-0.5">
                  <div>Menge: <strong className="text-slate-900">{totalSplitQty} Stück</strong></div>
                  <div>Betrag: <strong>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: order.currency || 'EUR' }).format(splitSubtotal)}</strong></div>
                  <div className="text-[11px] text-amber-700 font-medium">
                    {newOrderStatus === 'later_shipment' 
                      ? `⏳ Späterer Versand ${scheduledDate ? `(${scheduledDate})` : ''}`
                      : '⏳ Bleibt auf Pending'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => !isSubmitting && onClose()}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Wird aufgeteilt...
                </>
              ) : (
                <>
                  <Scissors className="w-4 h-4 rotate-90" />
                  Bestellung jetzt aufteilen ({totalSplitQty} Stk. abspalten)
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { applyOttoPriceReductionAction } from '@/app/actions/otto-refund'
import { useRouter } from 'next/navigation'
import type { OrderWithItems } from '@/app/(dashboard)/orders/orders-table'

interface OttoRefundModalProps {
  order: OrderWithItems
  onClose: () => void
  onSuccess?: () => void
}

export function OttoRefundModal({ order, onClose, onSuccess }: OttoRefundModalProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const rawPayload = order.rawPayload as any
  const positionItems = rawPayload?.positionItems || []

  const [selectedItemId, setSelectedItemId] = useState<string>(positionItems[0]?.positionItemId || '')
  const [amount, setAmount] = useState<string>('')
  const [reason, setReason] = useState<string>('CUSTOMER_DISSATISFACTION')

  const selectedItem = positionItems.find((i: any) => i.positionItemId === selectedItemId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedItemId) {
      setError('Bitte wählen Sie eine Position aus.')
      return
    }
    
    const numAmount = parseFloat(amount.replace(',', '.'))
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Bitte geben Sie einen gültigen Betrag größer 0 ein.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const result = await applyOttoPriceReductionAction(order.id, selectedItemId, numAmount, reason)
      if (result.error) {
        setError(result.error)
      } else {
        alert(result.message || 'Erstattung erfolgreich beauftragt.')
        if (onSuccess) onSuccess()
        onClose()
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message || 'Ein unerwarteter Fehler ist aufgetreten.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isSubmitting && onClose()}></div>
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-slate-800">OTTO Teilerstattung</h3>
              <p className="text-sm text-slate-500 mt-1">Für Bestellung {order.marketplaceOrderId}</p>
            </div>
            <button
              onClick={() => !isSubmitting && onClose()}
              className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          {!order.invoiceId && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-3">
              <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <div className="text-sm">
                <strong>Achtung:</strong> Es existiert noch keine OmniStack-Rechnung zu dieser Bestellung. Für eine saubere Buchhaltung sollte zuerst eine reguläre Rechnung erstellt werden.
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}

          <form id="otto-refund-form" onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-1.5">
                Artikel auswählen
              </label>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 outline-none transition-all disabled:opacity-50"
                required
              >
                {positionItems.length === 0 && <option value="">Keine Artikeldaten gefunden</option>}
                {positionItems.map((item: any) => {
                  const sku = item.product?.sku || item.positionItemId
                  const grossPrice = item.itemValueGrossPrice?.amount
                  return (
                    <option key={item.positionItemId} value={item.positionItemId}>
                      {sku} {grossPrice ? `(${grossPrice} €)` : ''}
                    </option>
                  )
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-1.5">
                Erstattungsbetrag (Brutto in €)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedItem?.itemValueGrossPrice?.amount || undefined}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 outline-none transition-all disabled:opacity-50 pl-10"
                  placeholder="0.00"
                  required
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">€</span>
              </div>
              {selectedItem?.itemValueGrossPrice?.amount && (
                <p className="text-xs text-slate-500 mt-1.5 ml-1">
                  Maximal erstattbar: {selectedItem.itemValueGrossPrice.amount.toFixed(2)} €
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-1.5">
                Grund der Erstattung
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 outline-none transition-all disabled:opacity-50"
                required
              >
                <option value="CUSTOMER_DISSATISFACTION">Kundenzufriedenheit (Kulanz)</option>
                <option value="DEFECTIVE">Artikel defekt</option>
                <option value="RETURNED">Artikel retourniert</option>
              </select>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 rounded-b-2xl">
          <button
            type="button"
            onClick={() => !isSubmitting && onClose()}
            className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            disabled={isSubmitting}
          >
            Abbrechen
          </button>
          <button
            type="submit"
            form="otto-refund-form"
            disabled={isSubmitting || positionItems.length === 0}
            className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-sm shadow-blue-200 transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="w-4 h-4 animate-spin opacity-75" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Wird verarbeitet...
              </>
            ) : (
              'Teilerstattung anfragen'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

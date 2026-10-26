'use client'

import React, { useState } from 'react'
import { Star, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { setProductMainSku } from '@/app/actions/products'
import { AlertModal } from '@/components/alert-modal'

interface SetMainSkuClientProps {
  productId: string
  marketplaceSku: string
  marketplaceName: string
  isMainSku: boolean
}

export function SetMainSkuClient({
  productId,
  marketplaceSku,
  marketplaceName,
  isMainSku,
}: SetMainSkuClientProps) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleConfirm = async () => {
    setIsUpdating(true)
    setError(null)
    try {
      const res = await setProductMainSku(productId, marketplaceSku)
      if (!res.success) {
        setError(res.error || 'Fehler beim Setzen der Haupt-SKU.')
        setIsUpdating(false)
        return
      }

      // Keep form input in sync if user submits main form later
      const skuInput = document.querySelector<HTMLInputElement>('input[name="sku"]')
      if (skuInput) {
        skuInput.value = marketplaceSku
      }

      setShowConfirm(false)
      setIsUpdating(false)
      router.refresh()
    } catch (err: any) {
      console.error(err)
      setError(err?.message || 'Unerwarteter Fehler beim Aktualisieren der Haupt-SKU.')
      setIsUpdating(false)
    }
  }

  if (isMainSku) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full shadow-2xs select-none"
        title="Diese SKU ist die zentrale Haupt-SKU des Produkts"
      >
        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500 shrink-0" />
        Haupt-SKU
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={isUpdating}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-amber-800 bg-slate-100 hover:bg-amber-50/80 border border-slate-200 hover:border-amber-300 px-2.5 py-0.5 rounded-md transition-all shadow-2xs group/mainsku cursor-pointer disabled:opacity-50"
        title={`"${marketplaceSku}" als Haupt-SKU festlegen`}
      >
        <Star className="w-3.5 h-3.5 text-slate-400 group-hover/mainsku:text-amber-500 group-hover/mainsku:fill-amber-400/40 transition-colors shrink-0" />
        Als Haupt-SKU festlegen
      </button>

      {/* Custom Confirmation Modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => !isUpdating && setShowConfirm(false)}
        >
          <div
            className="relative bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/50 dark:border-slate-800/50 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 p-6 flex flex-col items-center text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
              <Star className="w-6 h-6 fill-amber-500 text-amber-500" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Haupt-SKU festlegen
            </h3>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed font-medium">
              Möchten Sie die SKU{' '}
              <strong className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                {marketplaceSku}
              </strong>{' '}
              ({marketplaceName}) als aktive Haupt-SKU für diesen Artikel festlegen?
            </p>

            <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs text-amber-800 dark:bg-amber-950/30 dark:border-amber-800/40 dark:text-amber-200 mb-6 text-left">
              Diese SKU wird künftig im Kopfbereich, in den Stammdaten sowie in der zentralen
              Warenwirtschaft als Haupt-Artikelnummer angezeigt. Alle Marktplatz-Verknüpfungen bleiben
              dabei erhalten.
            </div>

            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={isUpdating}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isUpdating}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-semibold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Wird festgelegt...
                  </>
                ) : (
                  'Als Haupt-SKU festlegen'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error alert modal */}
      <AlertModal
        isOpen={!!error}
        onClose={() => setError(null)}
        title="Fehler"
        message={error || ''}
      />
    </>
  )
}

export function MainSkuBanner({ currentSku }: { currentSku: string }) {
  return (
    <div className="px-5 py-3 bg-gradient-to-r from-amber-50/70 via-amber-50/30 to-slate-50/50 border-b border-amber-100/70 flex items-center justify-between text-xs">
      <div className="flex items-center gap-2 text-slate-600">
        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500 shrink-0" />
        <span className="font-medium">Aktive Haupt-SKU:</span>
      </div>
      <span className="font-mono font-bold text-slate-900 bg-white px-2.5 py-0.5 rounded-md border border-amber-200/80 shadow-2xs">
        {currentSku}
      </span>
    </div>
  )
}

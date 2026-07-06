'use client'

import React, { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { deleteMapping } from '@/app/actions/products'
import { AlertModal } from '@/components/alert-modal'

export function DeleteMappingClient({ mappingId }: { mappingId: string }) {
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)
    try {
      await deleteMapping(mappingId)
      setShowConfirm(false)
      router.refresh()
    } catch (e) {
      console.error(e)
      setError('Fehler beim Löschen des Mappings.')
      setIsDeleting(false)
    }
  }

  return (
    <>
      <button 
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={isDeleting}
        className="text-rose-400 hover:text-rose-600 p-1 bg-rose-50 hover:bg-rose-100 rounded transition-colors disabled:opacity-50"
      >
        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center flex flex-col items-center animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 text-rose-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Mapping löschen</h3>
            <p className="text-sm text-slate-500 mb-6">
              Möchten Sie dieses Mapping wirklich aufheben? Der Artikel taucht danach wieder in der Liste der ungemappten Produkte auf.
            </p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                disabled={isDeleting}
              >
                Abbrechen
              </button>
              <button 
                onClick={handleDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 shadow-sm transition-colors flex items-center justify-center gap-2"
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertModal 
        isOpen={!!error}
        onClose={() => setError(null)}
        title="Fehler"
        message={error}
      />
    </>
  )
}

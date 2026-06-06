'use client'

import { useState } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import { deleteProduct } from '@/app/actions/products'
import { useRouter } from 'next/navigation'

export function DeleteProductButton({ productId, productTitle }: { productId: string, productTitle: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteProduct(productId)
      setIsOpen(false)
      router.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <button 
        onClick={(e) => { e.preventDefault(); setIsOpen(true); }}
        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        title="Produkt löschen"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(false); }}>
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200 relative overflow-hidden text-left" 
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-xl mb-2">Produkt löschen?</h3>
              <p className="text-slate-500 text-sm">
                Möchtest du das Produkt <strong>{productTitle}</strong> wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden und entfernt auch alle zugehörigen Marktplatz-Mappings.
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={(e) => { e.preventDefault(); setIsOpen(false); }}
                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
                disabled={isDeleting}
              >
                Abbrechen
              </button>
              <button 
                onClick={(e) => { e.preventDefault(); handleDelete(); }}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded-xl hover:bg-rose-700 shadow-sm shadow-rose-600/20 transition-all flex items-center gap-2"
                disabled={isDeleting}
              >
                {isDeleting ? 'Lösche...' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

'use client'

import React, { useState } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { addManualMapping } from '@/app/actions/products'

export function AddMappingClient({ productId, activeIntegrations }: { productId: string, activeIntegrations: any[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const [integrationId, setIntegrationId] = useState(activeIntegrations[0]?.id || '')
  const [sku, setSku] = useState('')
  const [ean, setEan] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sku.trim()) return
    setIsSubmitting(true)
    try {
      await addManualMapping(productId, integrationId, sku, ean)
      setIsOpen(false)
      setSku('')
      setEan('')
      router.refresh()
    } catch (e) {
      console.error(e)
      alert('Fehler beim Hinzufügen des Mappings.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) {
    return (
      <button 
        type="button" 
        onClick={() => setIsOpen(true)}
        className="w-full py-2 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg text-sm hover:bg-slate-100 transition-colors shadow-sm flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Mapping hinzufügen
      </button>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 mt-4 shadow-sm animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 text-sm">Neues Mapping</h3>
        <button type="button" onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">Marktplatz</label>
          <select 
            value={integrationId}
            onChange={e => setIntegrationId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-slate-900"
          >
            {activeIntegrations.map(int => (
              <option key={int.id} value={int.id}>
                {int.type === 'mirakl_custom' && int.metadata?.customName ? int.metadata.customName : int.type}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">SKU (Marktplatz)</label>
          <input 
            type="text" 
            required
            value={sku}
            onChange={e => setSku(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-slate-900 placeholder:text-slate-500"
            placeholder="z.B. 12345-BLU-L"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">EAN (optional)</label>
          <input 
            type="text" 
            value={ean}
            onChange={e => setEan(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-slate-900 placeholder:text-slate-500"
            placeholder="z.B. 4251439205740"
          />
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <button 
            type="button" 
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Abbrechen
          </button>
          <button 
            type="submit" 
            disabled={isSubmitting || !sku.trim()}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Speichern'}
          </button>
        </div>
      </form>
    </div>
  )
}

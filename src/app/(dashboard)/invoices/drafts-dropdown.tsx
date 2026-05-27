'use client'

import { useState, useEffect } from 'react'
import { getDraftsAction, deleteDraftAction } from '@/app/actions/manual-invoice'
import Link from 'next/link'

export function DraftsDropdown({ 
  initialDrafts = [], 
  documentType = 'invoice' 
}: { 
  initialDrafts?: any[]
  documentType?: 'invoice' | 'quote' | 'delivery_note'
}) {
  const [drafts, setDrafts] = useState<any[]>(initialDrafts)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const loadDrafts = async () => {
    setIsLoading(true)
    try {
      const data = await getDraftsAction(documentType)
      setDrafts(data)
    } catch (error) {
      console.error('Failed to load drafts', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadDrafts()
    }
  }, [isOpen])

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Diesen Entwurf wirklich löschen?')) return
    try {
      await deleteDraftAction(id)
      await loadDrafts()
    } catch (error) {
      alert('Fehler beim Löschen')
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
      >
        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9l-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Entwürfe laden ({drafts.length})
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 flex justify-between items-center">
            <span>Gespeicherte Entwürfe</span>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 animate-pulse">Lade Entwürfe...</div>
            ) : drafts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic">Keine Entwürfe gefunden</div>
            ) : (
              drafts.map(d => {
                const targetUrl = documentType === 'delivery_note' 
                  ? `/delivery-notes/new?draftId=${d.id}` 
                  : `/invoices/new?draftId=${d.id}`
                return (
                  <Link
                    key={d.id}
                    href={targetUrl}
                    className="block p-4 hover:bg-blue-50 border-b border-slate-100 last:border-0 transition-colors group"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 group-hover:text-blue-600 truncate">{d.draftName || 'Unbenannter Entwurf'}</div>
                        <div className="text-xs text-slate-500 mt-1 truncate">
                          {d.recipientName} • {new Date(d.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <div className="text-xs font-bold text-slate-400">
                          {parseFloat(d.totalAmount).toLocaleString('de-DE', { style: 'currency', currency: d.currency || 'EUR' })}
                        </div>
                        <button
                          onClick={(e) => handleDelete(e, d.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

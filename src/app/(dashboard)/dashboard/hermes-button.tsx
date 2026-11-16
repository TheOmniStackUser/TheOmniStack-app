'use client'

import { useTransition, useState } from 'react'
import { generateHermesLabelsAction } from '@/app/actions/shipping'

export function HermesButton() {
  const [isPending, startTransition] = useTransition()
  const [showModal, setShowModal] = useState(false)
  const [selectedParcelClass, setSelectedParcelClass] = useState('XS')
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const confirmGenerate = () => {
    setShowModal(false)
    const newTab = window.open('about:blank', '_blank')
    startTransition(async () => {
      try {
        const result = await generateHermesLabelsAction(undefined, selectedParcelClass)
        if (result?.error) {
          setFeedback({ message: result.error, type: 'error' })
          if (newTab) newTab.close()
        } else if (result) {
          setFeedback({ message: result.message || 'Hermes Labels wurden erfolgreich generiert.', type: 'success' })
          if (result.generatedIds && result.generatedIds.length > 0) {
            const url = `/api/orders/bulk/shipping-labels?ids=${result.generatedIds.join(',')}`
            if (newTab) {
              newTab.location.href = url
            } else {
              window.open(url, '_blank') || (window.location.href = url)
            }
          } else {
            if (newTab) newTab.close()
          }
        }
      } catch (e) {
        setFeedback({ message: 'Ein unerwarteter Fehler ist aufgetreten.', type: 'error' })
        if (newTab) newTab.close()
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={isPending}
        className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-2 rounded-lg shadow-sm text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {isPending ? (
          <>
            <svg className="animate-spin h-4 w-4 text-blue-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Erstelle Labels...
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
              <path d="M3 9h18"/>
              <path d="M9 21V9"/>
            </svg>
            Hermes Labels generieren
          </>
        )}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Hermes Paketgröße wählen</h3>
              <div className="space-y-3">
                {[
                  { id: 'XS', label: 'XS (max. 10 dl)' },
                  { id: 'S',  label: 'S (max. 50 dl)' },
                  { id: 'M',  label: 'M (max. 150 dl)' },
                  { id: 'L',  label: 'L (max. 450 dl)' },
                  { id: 'XL', label: 'XL (max. 4500 dl)' },
                ].map((size) => (
                  <label key={size.id} className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="parcelClassDashboard"
                      checked={selectedParcelClass === size.id}
                      onChange={() => setSelectedParcelClass(size.id)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <span className="ml-3 text-sm font-bold">{size.label}</span>
                  </label>
                ))}
              </div>
              <div className="mt-8 flex gap-3">
                <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-md text-sm">Abbrechen</button>
                <button onClick={confirmGenerate} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-bold">Labels generieren</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={() => setFeedback(null)}>
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-2xl px-6 pt-6 pb-6 text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full border border-slate-100">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  feedback.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                }`}>
                  {feedback.type === 'success' ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="text-base font-bold text-slate-900 mb-1">
                    {feedback.type === 'success' ? 'Hermes Versand' : 'Hinweis'}
                  </h4>
                  <p className="text-sm text-slate-600">{feedback.message}</p>
                </div>
              </div>
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-xl transition-colors shadow-sm"
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

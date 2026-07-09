'use client'

import { useState } from 'react'
import { cancelSubscriptionAction } from '@/app/actions/cancel-subscription'

export function CancelModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [effectiveDate, setEffectiveDate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const [category, setCategory] = useState<string>('')
  const [subReason, setSubReason] = useState<string>('')
  const [details, setDetails] = useState<string>('')

  if (!isOpen) return null

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    
    const formData = new FormData()
    formData.append('category', category)
    if (subReason) formData.append('subReason', subReason)
    if (details) formData.append('details', details)

    const result = await cancelSubscriptionAction(formData)
    
    setIsSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else if (result.success) {
      setSuccess(true)
      if (result.effectiveDate) {
        setEffectiveDate(new Date(result.effectiveDate).toLocaleDateString('de-DE'))
      }
    }
  }

  const renderSubOptions = () => {
    switch (category) {
      case 'Bedienbarkeit':
        return (
          <div className="ml-6 mt-2 space-y-2">
            {[
              'Die Software ist mir zu kompliziert',
              'Ein Wettbewerber ist einfacher zu bedienen',
              'Probleme mit der Shop-Anbindung'
            ].map(r => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="subReason" value={r} checked={subReason === r} onChange={() => { setSubReason(r); setDetails('') }} className="text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                <span className="text-sm text-slate-700">{r}</span>
              </label>
            ))}
          </div>
        )
      case 'Technische Probleme':
        return (
          <div className="ml-6 mt-2 space-y-2">
            {[
              'Fehlende Funktionen',
              'Probleme mit Shop-Anbindungen',
              'Sonstige technische Probleme'
            ].map(r => (
              <div key={r} className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="subReason" value={r} checked={subReason === r} onChange={() => { setSubReason(r); setDetails('') }} className="text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                  <span className="text-sm text-slate-700">{r}</span>
                </label>
                {subReason === 'Fehlende Funktionen' && r === 'Fehlende Funktionen' && (
                  <div className="ml-6">
                    <input 
                      type="text" 
                      placeholder="Welche Funktion?"
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      required
                      className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      case 'Kosten':
        return (
          <div className="ml-6 mt-2 space-y-2">
            {[
              'Ich benötige die kostenpflichtigen Funktionen nicht',
              'Ich möchte die kostenlose Version nutzen',
              'Ein Wettbewerber ist günstiger',
              'Die Kosten sind zu hoch',
              'Die Flex-Option ist mir zu teuer',
              'Die Archiv-Option ist mir zu teuer'
            ].map(r => (
              <div key={r} className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="subReason" value={r} checked={subReason === r} onChange={() => { setSubReason(r); setDetails('') }} className="text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                  <span className="text-sm text-slate-700">{r}</span>
                </label>
                {subReason === 'Ein Wettbewerber ist günstiger' && r === 'Ein Wettbewerber ist günstiger' && (
                  <div className="ml-6">
                    <input 
                      type="text" 
                      placeholder="Welcher Wettbewerber?"
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      required
                      className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      case 'Nicht mehr benötigt':
        return (
          <div className="ml-6 mt-2 space-y-2">
            {[
              'Geschäftsaufgabe',
              'Jemand anderes erstellt jetzt meine Rechnungen',
              'Zu viel Aufwand für die Pflege',
              'Vorsorgliche Kündigung'
            ].map(r => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="subReason" value={r} checked={subReason === r} onChange={() => { setSubReason(r); setDetails('') }} className="text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                <span className="text-sm text-slate-700">{r}</span>
              </label>
            ))}
          </div>
        )
      case 'Sonstiges':
        return (
          <div className="ml-6 mt-2">
            <textarea
              placeholder="Bitte beschreibe den Grund (optional)"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white min-h-[80px]"
            />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900">Paket kündigen</h2>
          {!success && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-200 cursor-pointer">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {success ? (
            <div className="text-center py-8 space-y-4 animate-in zoom-in-95">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900">Kündigung eingereicht</h3>
              <p className="text-slate-600">
                Deine Kündigung wurde erfolgreich vermerkt.
                {effectiveDate && <span> Sie wird wirksam zum <strong>{effectiveDate}</strong>.</span>}
              </p>
              <button 
                onClick={() => { onClose(); window.location.reload(); }}
                className="mt-6 px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
              >
                Schließen
              </button>
            </div>
          ) : (
            <form id="cancel-form" onSubmit={handleCancel} className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Schade, dass du dein Paket kündigen möchtest!</h3>
                <p className="text-sm text-slate-600">
                  Bitte gib uns kurz Feedback, warum du dich für eine Paketkündigung entschieden hast. 
                  Deine Meinung hilft uns, unseren Service zu verbessern.
                </p>
              </div>

              <div className="space-y-4">
                <p className="font-bold text-slate-800 text-sm">Weshalb möchtest du dein Paket nicht verlängern? <span className="text-red-500">*</span></p>
                
                {['Bedienbarkeit', 'Technische Probleme', 'Kosten', 'Nicht mehr benötigt', 'Sonstiges'].map(c => (
                  <div key={c} className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="category" 
                        value={c} 
                        checked={category === c} 
                        onChange={() => { setCategory(c); setSubReason(''); setDetails('') }} 
                        className="text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" 
                        required
                      />
                      <span className="font-medium text-slate-900">{c}</span>
                    </label>
                    {category === c && renderSubOptions()}
                  </div>
                ))}
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-sm font-medium border border-red-200 rounded-lg">
                  {error}
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
            <button 
              type="button" 
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              Zurück
            </button>
            <button 
              type="submit" 
              form="cancel-form"
              disabled={isSubmitting || !category || (['Bedienbarkeit', 'Technische Probleme', 'Kosten', 'Nicht mehr benötigt'].includes(category) && !subReason)}
              className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md transition-all disabled:opacity-50 disabled:grayscale cursor-pointer"
            >
              {isSubmitting ? 'Wird verarbeitet...' : 'Paket kündigen'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

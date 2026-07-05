'use client'

import { useState, useRef } from 'react'
import { UploadCloud, FileType, CheckCircle, AlertCircle, FileText } from 'lucide-react'
import { parseUploadedInvoice, importEInvoice } from '@/app/actions/invoices-import'
import { ParsedInvoiceData } from '@/lib/e-invoice-parser'
import { useRouter } from 'next/navigation'

export function InvoiceUpload() {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsedData, setParsedData] = useState<ParsedInvoiceData | null>(null)
  const [importAs, setImportAs] = useState<'incoming' | 'outgoing'>('incoming')
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const handleFile = async (file: File) => {
    setError(null)
    setParsedData(null)
    setIsUploading(true)

    const formData = new FormData()
    formData.append('file', file)

    const result = await parseUploadedInvoice(formData)
    if (result.success && result.data) {
      setParsedData(result.data)
    } else {
      setError(result.error || 'Fehler beim Auslesen der Datei.')
    }
    setIsUploading(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleSave = async () => {
    if (!parsedData) return
    setIsSaving(true)
    const res = await importEInvoice({ ...parsedData, importAs })
    setIsSaving(false)
    if (res.success) {
      router.push('/invoices') // or somewhere else
      router.refresh()
    } else {
      setError('Fehler beim Speichern in der Datenbank.')
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {!parsedData && (
        <div 
          className={`relative overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-300 ease-in-out p-12 text-center group cursor-pointer bg-white/40 backdrop-blur-xl
            ${isDragging ? 'border-blue-500 bg-blue-50/50 scale-[1.02]' : 'border-slate-300 hover:border-slate-400 hover:bg-white/60'}
          `}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => e.target.files && handleFile(e.target.files[0])} 
            className="hidden" 
            accept=".xml,.pdf"
          />

          <div className="relative z-10 flex flex-col items-center justify-center space-y-4">
            <div className={`p-4 rounded-2xl transition-all duration-300 ${isDragging ? 'bg-blue-100 text-blue-600 scale-110' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700 group-hover:-translate-y-1'}`}>
              <UploadCloud size={48} strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">E-Rechnung hochladen</h3>
              <p className="text-slate-500 mt-2">ZUGFeRD (PDF) oder XRechnung (XML) Datei hier ablegen oder klicken</p>
            </div>
          </div>

          {isUploading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-20">
              <div className="flex flex-col items-center space-y-3">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-semibold text-blue-700 animate-pulse">Lese Daten aus...</p>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50/80 backdrop-blur-md text-red-700 rounded-2xl border border-red-200 flex items-start gap-3 shadow-lg shadow-red-500/10">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold">Upload fehlgeschlagen</h4>
            <p className="text-sm mt-1">{error}</p>
            <button 
              onClick={() => setError(null)} 
              className="text-sm font-medium underline mt-2 hover:text-red-900"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      )}

      {parsedData && (
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-8 border border-white shadow-xl shadow-slate-200/50 space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className="flex items-center gap-4 border-b border-slate-200/60 pb-6">
            <div className="p-3 bg-green-100 text-green-700 rounded-2xl shadow-inner">
              <CheckCircle size={28} />
            </div>
            <div>
              <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">Erfolgreich ausgelesen</h3>
              <p className="text-slate-500 font-medium">Bitte überprüfe die erkannten Daten vor dem Import.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rechnungsnummer</span>
              <p className="text-lg font-semibold text-slate-900">{parsedData.invoiceNumber}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ausstellungsdatum</span>
              <p className="text-lg font-semibold text-slate-900">{parsedData.issueDate ? new Date(parsedData.issueDate).toLocaleDateString('de-DE') : 'Unbekannt'}</p>
            </div>
            <div className="space-y-1 col-span-2 p-4 bg-slate-50/80 rounded-2xl border border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lieferant / Partner</span>
              <p className="text-xl font-bold text-slate-900">{parsedData.supplierName}</p>
              {parsedData.supplierVatId && <p className="text-sm text-slate-500 mt-1">USt-IdNr: {parsedData.supplierVatId}</p>}
            </div>
            
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Netto</span>
              <p className="text-lg font-medium text-slate-700">{parsedData.subtotalAmount.toFixed(2)} {parsedData.currency}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Steuer</span>
              <p className="text-lg font-medium text-slate-700">{parsedData.taxAmount.toFixed(2)} {parsedData.currency}</p>
            </div>
            <div className="space-y-1 col-span-2 pt-4 border-t border-slate-200/60 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Gesamtbetrag</span>
              <p className="text-3xl font-extrabold text-blue-600 tracking-tight">{parsedData.totalAmount.toFixed(2)} {parsedData.currency}</p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200/60 space-y-6">
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-3">Wie soll die Rechnung importiert werden?</h4>
              <div className="flex gap-4">
                <label className={`flex-1 relative flex cursor-pointer rounded-2xl border-2 p-4 transition-all ${importAs === 'incoming' ? 'border-blue-600 bg-blue-50/50 shadow-md shadow-blue-500/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <input type="radio" name="importAs" value="incoming" className="sr-only" checked={importAs === 'incoming'} onChange={() => setImportAs('incoming')} />
                  <div>
                    <span className="block text-sm font-bold text-slate-900">Eingangsrechnung</span>
                    <span className="block text-xs text-slate-500 mt-1">Ausgabe, die bezahlt werden muss</span>
                  </div>
                </label>
                <label className={`flex-1 relative flex cursor-pointer rounded-2xl border-2 p-4 transition-all ${importAs === 'outgoing' ? 'border-blue-600 bg-blue-50/50 shadow-md shadow-blue-500/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <input type="radio" name="importAs" value="outgoing" className="sr-only" checked={importAs === 'outgoing'} onChange={() => setImportAs('outgoing')} />
                  <div>
                    <span className="block text-sm font-bold text-slate-900">Ausgangsrechnung</span>
                    <span className="block text-xs text-slate-500 mt-1">Externe Einnahme archivieren</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={() => setParsedData(null)}
                className="px-6 py-3 rounded-2xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Abbrechen
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 px-6 py-3 rounded-2xl font-bold text-white bg-slate-900 hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-900/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving && <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {isSaving ? 'Speichere...' : 'Jetzt Importieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

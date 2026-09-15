'use client'

import { useState } from 'react'
import { generateManufacturerCSVAction, uploadTrackingCSVAction } from '@/app/actions/manufacturer-csv'
import { useRouter } from 'next/navigation'

export function ManufacturerCsvDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const router = useRouter()

  const handleDownload = async () => {
    setIsLoading(true)
    try {
      const result = await generateManufacturerCSVAction()
      if (result.success && result.csvString) {
        const blob = new Blob([result.csvString], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `manufacturer_orders_${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        router.refresh()
      } else {
        alert(result.message || 'Fehler beim Erstellen des CSV')
      }
    } catch (e) {
      alert('Fehler beim Herunterladen')
    }
    setIsLoading(false)
  }

  const handleUpload = async () => {
    if (!uploadFile) return
    setIsLoading(true)
    try {
      const text = await uploadFile.text()
      const result = await uploadTrackingCSVAction(text)
      if (result.success) {
        alert(`Erfolgreich! ${result.updatedCount} Bestellungen aktualisiert.`)
        setUploadFile(null)
        setIsOpen(false)
        router.refresh()
      } else {
        alert('Fehler beim Import')
      }
    } catch (e) {
      alert('Fehler beim Hochladen')
    }
    setIsLoading(false)
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
        Hersteller CSV
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900">Hersteller CSV (Export/Import)</h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50">
                <h4 className="font-semibold text-slate-900 mb-2">1. Bestellungen exportieren</h4>
                <p className="text-sm text-slate-500 mb-4">
                  Lädt alle unversendeten Bestellungen herunter und markiert sie als "In Bearbeitung".
                </p>
                <button
                  onClick={handleDownload}
                  disabled={isLoading}
                  className="w-full py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
                >
                  {isLoading ? 'Lädt...' : 'CSV Herunterladen'}
                </button>
              </div>

              <div className="bg-green-50/50 p-4 rounded-2xl border border-green-100/50">
                <h4 className="font-semibold text-slate-900 mb-2">2. Trackingnummern importieren</h4>
                <p className="text-sm text-slate-500 mb-4">
                  Laden Sie die CSV-Datei des Herstellers mit den Trackingnummern hoch (Spalten "OrderID" und "TrackingNumber").
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-slate-900 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-white file:text-slate-900 hover:file:bg-slate-50 file:border file:border-slate-200 mb-4 cursor-pointer"
                />
                <button
                  onClick={handleUpload}
                  disabled={isLoading || !uploadFile}
                  className="w-full py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50"
                >
                  {isLoading ? 'Importiert...' : 'Trackingnummern Importieren'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

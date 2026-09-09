'use client'

import { useState, useRef } from 'react'
import { DownloadCloud, UploadCloud, Loader2 } from 'lucide-react'
import { exportProductsCsv, importProductsCsvAction } from '@/app/actions/products-csv'
import { useRouter } from 'next/navigation'

export function CsvActions() {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ text: string, type: 'error'|'success' } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const showStatus = (text: string, type: 'error'|'success') => {
    setStatusMsg({ text, type })
    setTimeout(() => setStatusMsg(null), 5000)
  }

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const csvString = await exportProductsCsv()
      
      // Create a blob and trigger download
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'produkte.csv')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Export error:', error)
      showStatus('Fehler beim Exportieren der Produkte.', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setIsImporting(true)
      const text = await file.text()
      const result = await importProductsCsvAction(text)
      if (result.success) {
        showStatus(`${result.count} Produkte wurden erfolgreich importiert.`, 'success')
        router.refresh()
      }
    } catch (error: any) {
      console.error('Import error:', error)
      showStatus(error.message || 'Fehler beim Importieren der Produkte.', 'error')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="flex gap-2 items-center relative">
      {statusMsg && (
        <div className={`absolute bottom-full mb-2 right-0 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap shadow-sm border animate-in slide-in-from-bottom-2 ${
          statusMsg.type === 'error' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
        }`}>
          {statusMsg.text}
        </div>
      )}
      <input 
        type="file" 
        accept=".csv" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
      />
      
      <button 
        onClick={() => fileInputRef.current?.click()}
        disabled={isImporting || isExporting}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 text-slate-700 font-semibold hover:bg-slate-100 transition-colors border border-slate-200 shadow-sm disabled:opacity-50"
      >
        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
        CSV Import
      </button>

      <button 
        onClick={handleExport}
        disabled={isExporting || isImporting}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 text-slate-700 font-semibold hover:bg-slate-100 transition-colors border border-slate-200 shadow-sm disabled:opacity-50"
      >
        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
        CSV Export
      </button>
    </div>
  )
}

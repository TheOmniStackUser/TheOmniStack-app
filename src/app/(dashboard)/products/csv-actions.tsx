'use client'

import { useState, useRef } from 'react'
import { DownloadCloud, UploadCloud, Loader2 } from 'lucide-react'
import { exportProductsCsv, importProductsCsvAction } from '@/app/actions/products-csv'
import { useRouter } from 'next/navigation'

export function CsvActions() {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

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
      alert('Fehler beim Exportieren der Produkte.')
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
        alert(`${result.count} Produkte wurden erfolgreich importiert.`)
        router.refresh()
      }
    } catch (error: any) {
      console.error('Import error:', error)
      alert(error.message || 'Fehler beim Importieren der Produkte.')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="flex gap-2">
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

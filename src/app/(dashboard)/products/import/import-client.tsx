'use client'

import { useState } from 'react'
import { DownloadCloud, Play, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'

export function ImportClient({ marketplaces }: { marketplaces: any[] }) {
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>('')
  const [isImporting, setIsImporting] = useState(false)
  const [notification, setNotification] = useState<{ message: string; description?: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showNotification = (message: string, description?: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, description, type })
    setTimeout(() => setNotification(null), 8000)
  }

  const handleImport = async () => {
    if (!selectedMarketplace) return
    setIsImporting(true)
    
    // Placeholder for actual manual import logic
    // Currently simulates calling the background worker for the specific integration
    showNotification('Import gestartet', `Produkte werden im Hintergrund von ${marketplaces.find(m => m.id === selectedMarketplace)?.type} abgerufen.`, 'info')
    
    setTimeout(() => {
      setIsImporting(false)
      showNotification('Import abgeschlossen', 'Neue Produkte stehen nun zur Verfügung.', 'success')
    }, 2000)
  }

  if (marketplaces.length === 0) {
    return (
      <div className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-sm font-medium">
        Keine Marktplätze angebunden.
      </div>
    )
  }

  return (
    <>
      {notification && (
        <div className="fixed top-6 right-6 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`flex items-start gap-3 p-4 rounded-2xl shadow-2xl border max-w-sm ${
            notification.type === 'success' ? 'bg-white border-emerald-100 text-emerald-900' : 
            notification.type === 'error' ? 'bg-white border-red-100 text-red-900' :
            'bg-white border-indigo-100 text-indigo-900'
          }`}>
            <div className={`p-2 rounded-xl mt-0.5 ${
              notification.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 
              notification.type === 'error' ? 'bg-red-50 text-red-600' :
              'bg-indigo-50 text-indigo-600'
            }`}>
              {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            </div>
            <div className="flex-1 pr-2">
              <p className="text-sm font-bold">{notification.message}</p>
              {notification.description && <p className="text-xs leading-relaxed opacity-80">{notification.description}</p>}
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="p-1 hover:bg-slate-50 rounded-lg transition-colors text-slate-400"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
        <select
          value={selectedMarketplace}
          onChange={(e) => setSelectedMarketplace(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50 outline-none w-48"
        >
          <option value="" disabled>Marktplatz wählen...</option>
          {marketplaces.map(m => (
            <option key={m.id} value={m.id}>
              {m.type.charAt(0).toUpperCase() + m.type.slice(1).replace('_', ' ')}
            </option>
          ))}
        </select>

        <button 
          disabled={!selectedMarketplace || isImporting}
          onClick={handleImport}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 shadow-md transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Import starten
        </button>
      </div>
    </>
  )
}

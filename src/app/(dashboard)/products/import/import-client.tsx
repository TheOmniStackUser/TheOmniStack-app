'use client'

import { useState, useEffect, useRef } from 'react'
import { DownloadCloud, Play, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { triggerProductImport, getImportSyncStatus } from '@/app/actions/products'

function getMarketplaceName(integration: any) {
  if (integration.type === 'mirakl_custom' && integration.metadata?.customName) {
    return integration.metadata.customName
  }
  const names: Record<string, string> = {
    amazon: 'Amazon',
    otto: 'Otto Market',
    shopify: 'Shopify',
    aboutyou: 'About You',
    kaufland: 'Kaufland',
    ebay: 'eBay',
    woocommerce: 'WooCommerce',
    shopware: 'Shopware',
    mirakl_decathlon: 'Decathlon',
    mirakl_decathlon_eu: 'Decathlon EU',
    mirakl_mediamarkt: 'MediaMarkt',
    mirakl_custom: 'Custom Mirakl',
  }
  return names[integration.type] || integration.type.charAt(0).toUpperCase() + integration.type.slice(1).replace('_', ' ')
}

export function ImportClient({ marketplaces }: { marketplaces: any[] }) {
  const router = useRouter()
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>('')
  const [isImporting, setIsImporting] = useState(false)
  const [notification, setNotification] = useState<{ message: string; description?: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [syncStatus, setSyncStatus] = useState<any>(null)
  const wasRunningRef = useRef(false)

  const showNotification = (message: string, description?: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, description, type })
    setTimeout(() => setNotification(null), 8000)
  }

  useEffect(() => {
    if (!selectedMarketplace) {
      setSyncStatus(null)
      return
    }
    const checkStatus = async () => {
      try {
        const status = await getImportSyncStatus(selectedMarketplace)
        setSyncStatus(status)
        if (status?.isRunning) {
          wasRunningRef.current = true
        } else if (!status?.isRunning && wasRunningRef.current) {
          wasRunningRef.current = false
          router.refresh()
          showNotification('Import abgeschlossen', 'Die Produktliste wurde aktualisiert.', 'success')
        }
      } catch (e) {}
    }
    checkStatus()
    const intervalId = setInterval(checkStatus, 2000)
    return () => clearInterval(intervalId)
  }, [selectedMarketplace, router])

  const handleImport = async () => {
    if (!selectedMarketplace) return
    setIsImporting(true)
    
    const selected = marketplaces.find(m => m.id === selectedMarketplace)
    showNotification('Import gestartet', `Produkte werden im Hintergrund von ${selected ? getMarketplaceName(selected) : 'dem Marktplatz'} abgerufen.`, 'info')
    
    try {
      await triggerProductImport(selectedMarketplace)
      wasRunningRef.current = true
    } catch (error: any) {
      showNotification('Fehler beim Import', error.message || 'Ein unerwarteter Fehler ist aufgetreten.', 'error')
    } finally {
      setIsImporting(false)
    }
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

      <div className="relative flex items-center gap-3 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
        <select
          value={selectedMarketplace}
          onChange={(e) => setSelectedMarketplace(e.target.value)}
          className={`bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50 outline-none w-48 ${!selectedMarketplace ? 'text-slate-500' : 'text-slate-900'}`}
        >
          <option value="" disabled>Marktplatz wählen...</option>
          {[...marketplaces].sort((a, b) => getMarketplaceName(a).localeCompare(getMarketplaceName(b))).map(m => (
            <option key={m.id} value={m.id}>
              {getMarketplaceName(m)}
            </option>
          ))}
        </select>

        <button 
          disabled={!selectedMarketplace || isImporting || syncStatus?.isRunning}
          onClick={handleImport}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 shadow-md transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(isImporting || syncStatus?.isRunning) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Import starten
        </button>

        {syncStatus?.isRunning && (
          <div className="absolute top-full left-0 right-0 mt-3 p-4 bg-white rounded-xl border border-indigo-100 shadow-xl z-20 animate-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                {syncStatus.message || 'Import läuft...'}
              </span>
              <span className="text-sm font-bold text-indigo-600">
                {syncStatus.total > 0 ? Math.round((syncStatus.progress / syncStatus.total) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-indigo-50 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out relative" 
                style={{ width: `${syncStatus.total > 0 ? (syncStatus.progress / syncStatus.total) * 100 : 0}%` }}
              >
                <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

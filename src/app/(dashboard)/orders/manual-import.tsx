'use client'

import { useState } from 'react'
import { triggerManualSyncAction } from '@/app/actions/sync'
import { useRouter } from 'next/navigation'

export function ManualImport({ 
  customMiraklIntegrations = [],
  hasKauflandIntegration = false,
  hasEbayIntegration = false,
  hasOttoIntegration = false,
  hasDecathlonIntegration = false,
  hasShopifyIntegration = false,
  hasAboutYouIntegration = false,
}: { 
  customMiraklIntegrations?: any[]
  hasKauflandIntegration?: boolean
  hasEbayIntegration?: boolean
  hasOttoIntegration?: boolean
  hasDecathlonIntegration?: boolean
  hasShopifyIntegration?: boolean
  hasAboutYouIntegration?: boolean
}) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(true)
  const [marketplace, setMarketplace] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const handleSync = async () => {
    setIsSyncing(true)
    setNotification(null)
    try {
      const result = await triggerManualSyncAction({
        marketplace,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined
      })

      if (result.error) {
        setNotification({ message: result.error, type: 'error' })
      } else {
        setNotification({ message: result.message || 'Import abgeschlossen', type: 'success' })
        // Auto-close after 10 seconds if it's a success
        setTimeout(() => setNotification(null), 10000)
      }
    } catch (e) {
      setNotification({ message: 'Ein unerwarteter Fehler ist aufgetreten.', type: 'error' })
    } finally {
      setIsSyncing(false)
    }
  }

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        Manuellen Import nach Zeitraum starten
      </button>
    )
  }

  return (
    <div className="mb-6 bg-white p-5 rounded-xl shadow-sm border border-blue-200">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-gray-900">Manueller Import</h3>
        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Marktplatz</label>
          <select 
            value={marketplace}
            onChange={e => setMarketplace(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
          >
            <option value="all">Alle Marktplätze</option>
            {hasOttoIntegration && <option value="otto">Otto</option>}
            {hasAboutYouIntegration && <option value="aboutyou">About You</option>}
            {hasShopifyIntegration && <option value="shopify">Shopify</option>}
            {hasDecathlonIntegration && <option value="mirakl_decathlon">Decathlon DE</option>}
            {hasKauflandIntegration && <option value="kaufland">Kaufland</option>}
            {hasEbayIntegration && <option value="ebay">eBay</option>}
            {customMiraklIntegrations.map((integration) => {
              const name = (integration.metadata as any)?.customName || 'Unbenannter Mirakl Marktplatz'
              return (
                <option key={integration.id} value={`mirakl_custom_${integration.id}`}>
                  {name}
                </option>
              )
            })}
          </select>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Von (Optional)</label>
          <input 
            type="date" 
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Bis (Optional)</label>
          <input 
            type="date" 
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
          />
        </div>

        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="w-full flex justify-center items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50 text-sm"
        >
          {isSyncing ? 'Startet...' : 'Import starten'}
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Tipp: Wird für Mirakl als Versanddatum (start_date) und für Otto als Bestelldatum (fromOrderDate) interpretiert.
      </p>

      {/* Modern Notification UI */}
      {notification && (
        <div className={`mt-4 p-4 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
          notification.type === 'success' 
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {notification.type === 'success' ? (
            <svg className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <div className="flex-1">
            <p className="text-sm font-medium whitespace-pre-line">
              {notification.message}
            </p>
          </div>
          <button 
            onClick={() => setNotification(null)}
            className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

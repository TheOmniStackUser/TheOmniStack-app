'use client'

import { useState, useEffect } from 'react'
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
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; label: string; simulatedProgress: number } | null>(null)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Simulate progress while waiting for the server
  useEffect(() => {
    if (isSyncing && syncProgress && syncProgress.current < syncProgress.total) {
      const timer = setInterval(() => {
        setSyncProgress(prev => {
          if (!prev) return prev;
          const diff = 90 - prev.simulatedProgress;
          const increment = Math.max(0.5, diff * 0.1);
          return { ...prev, simulatedProgress: Math.min(90, prev.simulatedProgress + increment) };
        });
      }, 500);
      return () => clearInterval(timer);
    }
  }, [isSyncing, syncProgress?.current, syncProgress?.total]);

  // Build and sort marketplace categories
  const groupedMarketplaces = (() => {
    const direct: { value: string; label: string }[] = []
    const decathlon: { value: string; label: string }[] = []
    const secretSales: { value: string; label: string }[] = []
    const other: { value: string; label: string }[] = []

    // Core / direct integrations
    if (hasOttoIntegration) direct.push({ value: 'otto', label: 'Otto' })
    if (hasAboutYouIntegration) direct.push({ value: 'aboutyou', label: 'About You' })
    if (hasShopifyIntegration) direct.push({ value: 'shopify', label: 'Shopify' })
    if (hasKauflandIntegration) direct.push({ value: 'kaufland', label: 'Kaufland' })
    if (hasEbayIntegration) direct.push({ value: 'ebay', label: 'eBay' })

    // Decathlon
    if (hasDecathlonIntegration) decathlon.push({ value: 'mirakl_decathlon', label: 'Decathlon DE' })

    // Custom integrations
    customMiraklIntegrations.forEach((integration) => {
      const name = (integration.metadata as any)?.customName || 'Unbenannter Mirakl Marktplatz'
      const lowerName = name.toLowerCase()
      const value = `mirakl_custom_${integration.id}`
      const label = name

      if (lowerName.startsWith('decathlon')) {
        decathlon.push({ value, label })
      } else if (lowerName.startsWith('secret sales')) {
        secretSales.push({ value, label })
      } else {
        other.push({ value, label })
      }
    })

    const sortFn = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'de')
    direct.sort(sortFn)
    decathlon.sort(sortFn)
    secretSales.sort(sortFn)
    other.sort(sortFn)

    return { direct, decathlon, secretSales, other }
  })()

  const handleSync = async () => {
    let selectedToSync: { value: string; label: string }[] = []
    
    if (marketplace === 'all') {
      selectedToSync = [
        ...groupedMarketplaces.direct,
        ...groupedMarketplaces.decathlon,
        ...groupedMarketplaces.secretSales,
        ...groupedMarketplaces.other
      ]
    } else if (marketplace === 'group_direct') {
      selectedToSync = [...groupedMarketplaces.direct]
    } else if (marketplace === 'group_decathlon') {
      selectedToSync = [...groupedMarketplaces.decathlon]
    } else if (marketplace === 'group_secret_sales') {
      selectedToSync = [...groupedMarketplaces.secretSales]
    } else if (marketplace === 'group_other') {
      selectedToSync = [...groupedMarketplaces.other]
    } else {
      const all = [
        ...groupedMarketplaces.direct,
        ...groupedMarketplaces.decathlon,
        ...groupedMarketplaces.secretSales,
        ...groupedMarketplaces.other
      ]
      const found = all.find((m) => m.value === marketplace)
      if (found) selectedToSync.push(found)
    }

    if (selectedToSync.length === 0) {
      setNotification({ message: 'Bitte wählen Sie mindestens einen Marktplatz aus.', type: 'error' })
      return
    }

    setIsSyncing(true)
    setNotification(null)
    setSyncProgress({ current: 0, total: selectedToSync.length, label: selectedToSync[0].label, simulatedProgress: 0 })

    let totalAffected = 0
    let hasError = false

    try {
      for (let i = 0; i < selectedToSync.length; i++) {
        const currentMarketplace = selectedToSync[i]
        setSyncProgress({ current: i, total: selectedToSync.length, label: currentMarketplace.label, simulatedProgress: 0 })
        
        const result = await triggerManualSyncAction({
          marketplace: currentMarketplace.value,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined
        })

        if (result.error) {
          hasError = true
          setNotification({ message: result.error, type: 'error' })
          break
        }
        
        if (result.affected !== undefined) {
          totalAffected += result.affected
        }
      }

      if (!hasError) {
        setSyncProgress({ current: selectedToSync.length, total: selectedToSync.length, label: 'Abgeschlossen', simulatedProgress: 100 })
        setNotification({ 
          message: totalAffected > 0 
            ? `Import erfolgreich! ${totalAffected} neue Bestellung(en) wurden hinzugefügt.` 
            : 'Import abgeschlossen! Es wurden keine neuen Bestellungen gefunden.', 
          type: 'success' 
        })
        setTimeout(() => setNotification(null), 10000)
      }
    } catch (e) {
      setNotification({ message: 'Ein unerwarteter Fehler ist aufgetreten.', type: 'error' })
    } finally {
      setIsSyncing(false)
      setTimeout(() => setSyncProgress(null), 2000)
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

            {groupedMarketplaces.direct.length > 0 && (
              <>
                <option value="group_direct" className="font-semibold bg-gray-50">Direkte Integrationen</option>
                {groupedMarketplaces.direct.map((m) => (
                  <option key={m.value} value={m.value}>{"\u00A0\u00A0"}{m.label}</option>
                ))}
              </>
            )}

            {groupedMarketplaces.decathlon.length > 0 && (
              <>
                <option value="group_decathlon" className="font-semibold bg-gray-50">Decathlon Marktplätze</option>
                {groupedMarketplaces.decathlon.map((m) => (
                  <option key={m.value} value={m.value}>{"\u00A0\u00A0"}{m.label}</option>
                ))}
              </>
            )}

            {groupedMarketplaces.secretSales.length > 0 && (
              <>
                <option value="group_secret_sales" className="font-semibold bg-gray-50">Secret Sales Marktplätze</option>
                {groupedMarketplaces.secretSales.map((m) => (
                  <option key={m.value} value={m.value}>{"\u00A0\u00A0"}{m.label}</option>
                ))}
              </>
            )}

            {groupedMarketplaces.other.length > 0 && (
              <>
                <option value="group_other" className="font-semibold bg-gray-50">Weitere Marktplätze</option>
                {groupedMarketplaces.other.map((m) => (
                  <option key={m.value} value={m.value}>{"\u00A0\u00A0"}{m.label}</option>
                ))}
              </>
            )}
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
        Tipp: Wird für Mirakl als Versanddatum (start_date) und für Otto als {process.env.NEXT_PUBLIC_APP_VARIANT === 'craft' ? 'Auftragsdatum' : 'Bestelldatum'} (fromOrderDate) interpretiert.
      </p>

      {/* Progress UI */}
      {syncProgress && (
        <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              {syncProgress.current < syncProgress.total ? `Importiere ${syncProgress.label}...` : 'Import abgeschlossen'}
            </span>
            <span className="text-sm font-bold text-blue-600">
              {syncProgress.current < syncProgress.total 
                ? Math.min(99, Math.round(((syncProgress.current / syncProgress.total) * 100) + ((syncProgress.simulatedProgress / 100) * (100 / syncProgress.total))))
                : 100}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${syncProgress.current < syncProgress.total 
                ? Math.min(99, Math.round(((syncProgress.current / syncProgress.total) * 100) + ((syncProgress.simulatedProgress / 100) * (100 / syncProgress.total))))
                : 100}%` }}
            ></div>
          </div>
          <div className="mt-2 text-xs text-gray-500 text-right">
            Marktplatz {Math.min(syncProgress.current + 1, syncProgress.total)} von {syncProgress.total}
          </div>
        </div>
      )}

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

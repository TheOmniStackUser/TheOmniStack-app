'use client'

import { useState } from 'react'
import { updateMarketplaceSyncSettings, MarketplaceSyncSettings } from '@/app/actions/products'
import { Save, Check, ServerCrash, CheckCircle2, AlertCircle, X } from 'lucide-react'

function getMarketplaceName(type: string) {
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
  return names[type] || type
}

function IntegrationCard({ integration, showNotification }: { integration: any, showNotification: any }) {
  const metadata = (integration.metadata as any) || {}
  const initialSettings: MarketplaceSyncSettings = metadata.productSync || {
    enabled: false,
    syncStock: true,
    syncPrice: false,
    priceModifierType: 'none',
    priceModifierValue: 0,
  }

  const [settings, setSettings] = useState<MarketplaceSyncSettings>(initialSettings)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateMarketplaceSyncSettings(integration.id, settings)
      showNotification(`${getMarketplaceName(integration.type)} Einstellungen gespeichert.`, undefined, 'success')
    } catch (err: any) {
      showNotification('Fehler beim Speichern', err.message, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">{getMarketplaceName(integration.type)}</h2>
        
        <label className="flex items-center cursor-pointer gap-3">
          <span className="text-sm font-semibold text-slate-700">Sync Aktiv</span>
          <div className="relative">
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
          </div>
        </label>
      </div>

      <div className={`p-6 space-y-6 flex-1 transition-opacity ${!settings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-900">Bestandsabgleich</p>
              <p className="text-xs text-slate-500 mt-1">Automatisch Lagerbestände an {getMarketplaceName(integration.type)} senden.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.syncStock}
                onChange={(e) => setSettings({ ...settings, syncStock: e.target.checked })}
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-900">Preisabgleich</p>
              <p className="text-xs text-slate-500 mt-1">Automatisch Preise an {getMarketplaceName(integration.type)} senden.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.syncPrice}
                onChange={(e) => setSettings({ ...settings, syncPrice: e.target.checked })}
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>
        </div>

        <div className={`pt-4 border-t border-slate-100 transition-all ${!settings.syncPrice ? 'opacity-50 pointer-events-none' : ''}`}>
          <h3 className="text-sm font-bold text-slate-900 mb-4">Preisaufschlag / Discount</h3>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Typ</label>
              <select 
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all"
                value={settings.priceModifierType}
                onChange={(e) => setSettings({ ...settings, priceModifierType: e.target.value as any })}
              >
                <option value="none">Keine Änderung (1:1)</option>
                <option value="percentage">Prozentual (%)</option>
                <option value="fixed">Fixbetrag (€)</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Wert</label>
              <div className="relative">
                <input 
                  type="number"
                  disabled={settings.priceModifierType === 'none'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm font-medium focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all disabled:opacity-50"
                  placeholder="z.B. 10 für +10%"
                  value={settings.priceModifierValue}
                  onChange={(e) => setSettings({ ...settings, priceModifierValue: parseFloat(e.target.value) || 0 })}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">
                  {settings.priceModifierType === 'percentage' ? '%' : settings.priceModifierType === 'fixed' ? '€' : ''}
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">Nutzen Sie negative Werte (z.B. -5) für einen Discount.</p>
        </div>

      </div>
      
      <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors disabled:opacity-70"
        >
          {isSaving ? <Check className="w-4 h-4 animate-pulse" /> : <Save className="w-4 h-4" />}
          Speichern
        </button>
      </div>
    </div>
  )
}

export function SyncSettingsClient({ integrations }: { integrations: any[] }) {
  const [notification, setNotification] = useState<{ message: string; description?: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showNotification = (message: string, description?: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, description, type })
    setTimeout(() => setNotification(null), 8000)
  }

  if (integrations.length === 0) {
    return (
      <div className="bg-white p-12 rounded-2xl border border-slate-100 shadow-sm text-center">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <ServerCrash className="w-8 h-8 text-slate-300" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">Keine Integrationen gefunden</h3>
        <p className="text-slate-500 mt-2">Bitte binden Sie zuerst unter "Integrationen" Marktplätze an.</p>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {integrations.map((integration) => (
          <IntegrationCard key={integration.id} integration={integration} showNotification={showNotification} />
        ))}
      </div>
    </>
  )
}

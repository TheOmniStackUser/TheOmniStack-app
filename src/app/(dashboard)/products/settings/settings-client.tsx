'use client'

import { useState } from 'react'
import { updateMarketplaceSyncSettings } from '@/app/actions/products'
import type { MarketplaceSyncSettings } from '@/app/actions/products'
import { Save, Check, ServerCrash, CheckCircle2, AlertCircle, X } from 'lucide-react'

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
  return names[integration.type] || integration.type
}

function IntegrationCard({ integration, showNotification }: { integration: any, showNotification: any }) {
  const metadata = (integration.metadata as any) || {}
  const initialSettings: MarketplaceSyncSettings = {
    enabled: false,
    syncStock: true,
    syncPrice: false,
    priceModifierType: 'none',
    priceModifierValue: 0,
    priceBase: 'standard',
    minPriceThreshold: undefined,
    ...(metadata.productSync || {}),
  }

  const [settings, setSettings] = useState<MarketplaceSyncSettings>(initialSettings)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateMarketplaceSyncSettings(integration.id, settings)
      showNotification(`${getMarketplaceName(integration)} Einstellungen gespeichert.`, undefined, 'success')
    } catch (err: any) {
      showNotification('Fehler beim Speichern', err.message, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">{getMarketplaceName(integration)}</h2>
        
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
              <p className="text-xs text-slate-500 mt-1">Automatisch Lagerbestände an {getMarketplaceName(integration)} senden.</p>
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
              <p className="text-xs text-slate-500 mt-1">Automatisch Preise an {getMarketplaceName(integration)} senden.</p>
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-4">
            <h3 className="text-sm font-bold text-slate-900">Preisaufschlag / Discount</h3>
            <span className="text-xs text-slate-500">Regeln für Preisübertragung an {getMarketplaceName(integration)}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Typ */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Typ</label>
              <select 
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all shadow-sm"
                value={settings.priceModifierType}
                onChange={(e) => setSettings({ ...settings, priceModifierType: e.target.value as any })}
              >
                <option value="none" className="text-slate-900 bg-white">Keine Änderung (1:1)</option>
                <option value="percentage" className="text-slate-900 bg-white">Prozentual (%)</option>
                <option value="fixed" className="text-slate-900 bg-white">Fixbetrag (€)</option>
              </select>
            </div>

            {/* Wert */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Wert</label>
              <div className="relative">
                <input 
                  type="number"
                  step="0.01"
                  disabled={settings.priceModifierType === 'none'}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all disabled:opacity-50 disabled:bg-slate-50 shadow-sm"
                  placeholder="z.B. 10 für +10% oder -15 für 15% Rabatt"
                  value={settings.priceModifierValue}
                  onChange={(e) => setSettings({ ...settings, priceModifierValue: parseFloat(e.target.value) || 0 })}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm pointer-events-none">
                  {settings.priceModifierType === 'percentage' ? '%' : settings.priceModifierType === 'fixed' ? '€' : ''}
                </div>
              </div>
            </div>

            {/* Berechnungsgrundlage / Basispreis */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Berechnungsgrundlage (Basispreis)</label>
              <select 
                disabled={settings.priceModifierType === 'none'}
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all disabled:opacity-50 disabled:bg-slate-50 shadow-sm"
                value={settings.priceBase || 'standard'}
                onChange={(e) => setSettings({ ...settings, priceBase: e.target.value as any })}
              >
                <option value="standard" className="text-slate-900 bg-white">Standard-Preis (Verkaufspreis)</option>
                <option value="msrp" className="text-slate-900 bg-white">UVP (Unverbindliche Preisempfehlung)</option>
                <option value="reduced" className="text-slate-900 bg-white">Reduzierter Preis (Aktionspreis)</option>
                <option value="all" className="text-slate-900 bg-white">Standard- & Reduzierter Preis</option>
              </select>
              <p className="text-xs text-slate-500 mt-1.5">Auf welchen Produktpreis der Aufschlag/Abschlag angewendet wird.</p>
            </div>

            {/* Rabatt-Ausschlussgrenze */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Rabatt-Ausschlussgrenze (€)</label>
              <div className="relative">
                <input 
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={settings.priceModifierType === 'none'}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all disabled:opacity-50 disabled:bg-slate-50 shadow-sm"
                  placeholder="z.B. 15.00 (optional)"
                  value={settings.minPriceThreshold !== undefined && settings.minPriceThreshold !== null ? settings.minPriceThreshold : ''}
                  onChange={(e) => {
                    const raw = e.target.value
                    setSettings({ 
                      ...settings, 
                      minPriceThreshold: raw === '' ? undefined : (parseFloat(raw) || 0) 
                    })
                  }}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm pointer-events-none">
                  €
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">Preise unter diesem Betrag werden von Discounts/Abschlägen ausgenommen.</p>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-3">Nutzen Sie negative Werte (z.B. -5) für einen Discount/Abschlag.</p>
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
    if (type !== 'error') {
      setTimeout(() => setNotification(null), 8000)
    }
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

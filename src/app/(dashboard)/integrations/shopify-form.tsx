'use client'

import { useState } from 'react'
import { HelpCircle, Plus, Store, CheckCircle2, X } from 'lucide-react'
import { DisconnectButton } from './disconnect-button'

interface ShopifyIntegrationItem {
  id: string
  environment: string | null
  accessToken?: string | null
  isActive: boolean
  metadata?: any
}

export function ShopifyIntegrationForm({ 
  initialData, 
  initialIntegrations 
}: { 
  initialData?: ShopifyIntegrationItem
  initialIntegrations?: ShopifyIntegrationItem[] 
}) {
  // Support either single initialData or array of initialIntegrations
  const allIntegrations = (initialIntegrations 
    ? initialIntegrations.filter((i) => i.isActive && i.accessToken)
    : (initialData?.accessToken && initialData.isActive ? [initialData] : [])
  ).filter((i): i is ShopifyIntegrationItem & { environment: string } => Boolean(i.environment))

  const [shopDomain, setShopDomain] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(allIntegrations.length === 0)

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    
    if (!shopDomain) return
    
    // Clean up domain (remove https, trailing slashes, etc)
    let cleanDomain = shopDomain.trim().toLowerCase()
    cleanDomain = cleanDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    
    // Auto-append .myshopify.com if they only typed the store name
    if (!cleanDomain.includes('.myshopify.com')) {
      cleanDomain = `${cleanDomain}.myshopify.com`
    }

    // Check if domain is already connected
    const isAlreadyConnected = allIntegrations.some(
      (i) => i.environment.toLowerCase() === cleanDomain
    )
    if (isAlreadyConnected) {
      setErrorMessage(`Der Shop "${cleanDomain}" ist bereits verbunden. Nutze "Verbindung erneuern", falls du den Zugriff aktualisieren möchtest.`)
      return
    }

    setIsLoading(true)
    // Redirect to our install API route with force=true to ensure fresh OAuth flow for this store
    window.location.href = `/api/auth/shopify/install?shop=${encodeURIComponent(cleanDomain)}&force=true&t=${Date.now()}`
  }

  return (
    <div className="space-y-6">
      {/* List of Connected Shopify Stores */}
      {allIntegrations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Verbundene Shops ({allIntegrations.length})
            </h4>
          </div>

          <div className="grid gap-3">
            {allIntegrations.map((integration) => {
              const shopName = integration.metadata?.shop?.name || integration.environment
              const shopDomainName = integration.environment
              const isShopifyBilled = integration.metadata?.isShopifyBilled === true

              return (
                <div
                  key={integration.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center flex-shrink-0 text-green-700">
                      <Store className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">{shopName}</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-50 text-green-700 border border-green-200">
                          <CheckCircle2 className="w-3 h-3 text-green-600" />
                          Verbunden
                        </span>
                        {isShopifyBilled && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            App Store Abrechnung
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">
                        {shopDomainName}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/api/auth/shopify/install?shop=${encodeURIComponent(shopDomainName)}&reconnect=true&t=${Date.now()}`}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold shadow-sm transition-all text-center inline-flex items-center gap-1.5 active:scale-95"
                    >
                      Verbindung erneuern
                    </a>
                    <DisconnectButton type="shopify" id={integration.id} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Button to open "Connect another store" form */}
      {allIntegrations.length > 0 && !showAddForm && (
        <div>
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null)
              setShowAddForm(true)
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-slate-300 hover:border-[#95BF47] text-slate-700 hover:text-green-800 rounded-xl text-sm font-semibold transition-all hover:bg-green-50/40 active:scale-95"
          >
            <Plus className="w-4 h-4 text-[#95BF47]" />
            Weiteren Shopify Shop verbinden
          </button>
        </div>
      )}

      {/* Add New Store Form */}
      {showAddForm && (
        <div className={`max-w-md ${allIntegrations.length > 0 ? 'p-4 bg-white border border-slate-200 rounded-xl shadow-sm' : ''}`}>
          {allIntegrations.length > 0 && (
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-green-600" />
                Weiteren Shopify Shop anbinden
              </h4>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false)
                  setShopDomain('')
                  setErrorMessage(null)
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
                title="Abbrechen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label htmlFor="shopDomain" className="block text-sm font-medium text-slate-900">
                  {allIntegrations.length > 0 ? 'Weiterer Shopify Shop-Name' : 'Dein Shopify Shop-Name'}
                </label>
                <div className="group relative flex items-center">
                  <HelpCircle className="w-4 h-4 text-slate-400 hover:text-green-600 cursor-help transition-colors" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl z-50 font-normal">
                    <p>
                      Deinen internen Shop-Namen findest du oben in der Adressleiste deines Browsers, wenn du im Shopify Admin-Bereich eingeloggt bist.<br/><br/>
                      Beispiel: Wenn deine URL <strong>admin.shopify.com/store/mein-shop</strong> lautet, trage hier nur <strong>mein-shop</strong> ein.
                    </p>
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </div>
              </div>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  type="text"
                  id="shopDomain"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  required
                  className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md border border-slate-300 focus:ring-green-500 focus:border-green-500 text-slate-900 placeholder:text-slate-500 bg-white text-sm"
                  placeholder="mein-shop"
                />
                <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-slate-300 bg-slate-50 text-slate-600 text-sm select-none">
                  .myshopify.com
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">Trage hier den internen Namen deines Shopify Stores ein.</p>
              
              {errorMessage && (
                <p className="mt-2 text-xs font-medium text-red-600 bg-red-50 p-2 rounded-md border border-red-200">
                  {errorMessage}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isLoading || !shopDomain}
                className="flex-1 flex justify-center items-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-[#95BF47] hover:bg-[#85ab3f] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#95BF47] disabled:opacity-50 transition-colors"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verbinde mit Shopify...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21.2 15.6c-.3-1.6-1.5-2.2-2.9-2.7-1.3-.5-1.5-.7-1.5-1.2 0-.6.7-.9 1.5-.9 1 0 2 .3 2.6.8l1-2.2c-1-.7-2.3-1-3.6-1-2.6 0-4.6 1.3-4.6 3.6 0 1.5 1.2 2.3 2.8 2.8 1.4.5 1.6.8 1.6 1.3 0 .7-.8 1-1.7 1-1.2 0-2.4-.4-3.2-1.1l-1 2.3c1 .8 2.6 1.3 4.2 1.3 2.6.1 4.8-1.2 4.8-4m-12.7.2c-.3-1.6-1.5-2.2-2.9-2.7-1.3-.5-1.5-.7-1.5-1.2 0-.6.7-.9 1.5-.9 1 0 2 .3 2.6.8l1-2.2c-1-.7-2.3-1-3.6-1-2.6 0-4.6 1.3-4.6 3.6 0 1.5 1.2 2.3 2.8 2.8 1.4.5 1.6.8 1.6 1.3 0 .7-.8 1-1.7 1-1.2 0-2.4-.4-3.2-1.1l-1 2.3c1 .8 2.6 1.3 4.2 1.3 2.6.1 4.8-1.2 4.8-4M2.3 6l1.2 12.8c.1.9 1 1.6 1.9 1.6h13.2c.9 0 1.8-.7 1.9-1.6l1.2-12.8H2.3zm13.1 12H8.6l-.8-8.8h8.4l-.8 8.8zM12 2C8.7 2 6 4.7 6 8h2c0-2.2 1.8-4 4-4s4 1.8 4 4h2c0-3.3-2.7-6-6-6z"/>
                    </svg>
                    Jetzt mit Shopify verbinden
                  </span>
                )}
              </button>

              {allIntegrations.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false)
                    setShopDomain('')
                    setErrorMessage(null)
                  }}
                  className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors"
                >
                  Abbrechen
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}


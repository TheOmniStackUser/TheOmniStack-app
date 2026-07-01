'use client'

import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { ConfirmModal } from '@/components/confirm-modal'

export function ShopifyIntegrationForm({ initialData }: { initialData?: any }) {
  const [shopDomain, setShopDomain] = useState(initialData?.environment || '')
  const [isLoading, setIsLoading] = useState(false)

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!shopDomain) return
    
    // Clean up domain (remove https, trailing slashes, etc)
    let cleanDomain = shopDomain.trim().toLowerCase()
    cleanDomain = cleanDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    
    // Auto-append .myshopify.com if they only typed the store name
    if (!cleanDomain.includes('.myshopify.com')) {
      cleanDomain = `${cleanDomain}.myshopify.com`
    }

    setIsLoading(true)
    // Redirect to our install API route
    window.location.href = `/api/auth/shopify/install?shop=${encodeURIComponent(cleanDomain)}`
  }

  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false)

  const handleDisconnect = async () => {
    const { disconnectShopifyAction } = await import('@/app/actions/integrations')
    await disconnectShopifyAction()
  }

  // If already connected, show connection status instead of input
  if (initialData?.accessToken) {
    return (
      <div className="space-y-4 max-w-md">
        <p className="text-sm text-gray-600">
          TheOmniStack ist erfolgreich mit <strong>{initialData.environment}</strong> verknüpft.
        </p>
        <button
          onClick={() => setIsDisconnectModalOpen(true)}
          className="w-full py-2.5 px-4 border border-red-300 rounded-md shadow-sm text-sm font-bold text-red-600 bg-white hover:bg-red-50 focus:outline-none transition-colors"
        >
          Verbindung trennen
        </button>

        <ConfirmModal
          isOpen={isDisconnectModalOpen}
          onClose={() => setIsDisconnectModalOpen(false)}
          onConfirm={handleDisconnect}
          title="Verbindung trennen"
          message="Möchtest du die Verbindung zu Shopify wirklich trennen?"
          confirmText="Ja, trennen"
          cancelText="Abbrechen"
          isDestructive={true}
        />
      </div>
    )
  }

  return (
    <form onSubmit={handleConnect} className="w-full max-w-md space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <label htmlFor="shopDomain" className="block text-sm font-medium text-gray-700">
            Dein Shopify Shop-Name
          </label>
          <div className="group relative flex items-center">
            <HelpCircle className="w-4 h-4 text-gray-400 hover:text-green-600 cursor-help transition-colors" />
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
            className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md border border-gray-300 focus:ring-green-500 focus:border-green-500 text-black placeholder-gray-400"
            placeholder="mein-shop"
          />
          <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
            .myshopify.com
          </span>
        </div>
        <p className="mt-1.5 text-xs text-gray-500">Trage hier den internen Namen deines Shops ein.</p>
      </div>

      <button
        type="submit"
        disabled={isLoading || !shopDomain}
        className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-[#95BF47] hover:bg-[#85ab3f] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#95BF47] disabled:opacity-50 transition-colors"
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
    </form>
  )
}

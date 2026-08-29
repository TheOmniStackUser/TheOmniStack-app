'use client'

import { DisconnectButton } from './disconnect-button'

export function AmazonIntegrationForm({ 
  initialSellerId,
  companyId
}: { 
  initialSellerId: string 
  companyId: string
}) {
  const isConnected = !!initialSellerId;

  return (
    <div className="space-y-4">
      {isConnected ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-sm text-green-800 font-medium">
            ✓ Erfolgreich mit Amazon verbunden <br className="sm:hidden" />
            <span className="font-normal opacity-75">(Seller ID: {initialSellerId})</span>
          </p>
          <DisconnectButton type="amazon" />
        </div>
      ) : (
        <div className="p-6 bg-white border border-gray-200 rounded-md text-center max-w-xl mx-auto">
          <div className="mx-auto w-12 h-12 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mb-4">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Mit Amazon verbinden</h3>
          <p className="text-sm text-gray-500 mb-6">
            Du wirst zu Amazon weitergeleitet, um die Verknüpfung sicher zu autorisieren. Es werden keine Passwörter oder komplexen Tokens benötigt.
          </p>
          <a
            href={`/api/auth/amazon?action=connect&companyId=${companyId}`}
            className="inline-flex justify-center w-full sm:w-auto px-6 py-2.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors"
          >
            Mit Amazon verbinden
          </a>
        </div>
      )}
    </div>
  )
}

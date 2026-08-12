import { DisconnectButton } from './disconnect-button'

export function EbayIntegrationForm({ 
  companyId,
  isConnected = false,
}: { 
  companyId: string,
  isConnected?: boolean,
}) {
  return (
    <div className="space-y-6 max-w-xl">
      {/* OAuth Connect Button */}
      <div className="pt-2 border-gray-200">
        <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl space-y-4">
          <div>
            <p className="font-semibold text-blue-900 mb-1">eBay Account verknüpfen</p>
            <p className="text-sm text-blue-800 leading-relaxed">
              Klicke auf den Button unten, um dich bei eBay einzuloggen und theomnistack den Zugriff auf Bestellungen und Retouren zu erlauben.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={`/api/auth/ebay?action=connect&companyId=${companyId}`}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#0064d2] hover:bg-[#0051a8] text-white font-semibold rounded-xl transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
              {isConnected ? 'Verbindung erneuern' : 'Jetzt mit eBay verbinden'}
            </a>
            {isConnected && <DisconnectButton type="ebay" />}
          </div>
        </div>
      </div>
    </div>
  )
}

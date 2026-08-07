import { ExternalLink } from 'lucide-react'
import { DisconnectButton } from './disconnect-button'

export function EtsyIntegrationForm({
  companyId,
  isConnected = false,
}: {
  companyId: string
  initialClientId?: string
  initialClientSecret?: string
  isConnected?: boolean
}) {
  return (
    <div className="space-y-6 max-w-xl">
      <div className="pt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
        {isConnected && <DisconnectButton type="etsy" />}
      </div>

      <div className="pt-6 border-t border-gray-200">
        <div className="p-5 bg-orange-50 border border-orange-200 rounded-xl space-y-4">
          <div>
            <p className="font-semibold text-orange-900 mb-1">Etsy Shop verknüpfen</p>
            <p className="text-sm text-orange-800 leading-relaxed">
              Klicke auf den Button unten, um dich bei Etsy einzuloggen und die App zu autorisieren.
            </p>
          </div>
          
          <a
            href={`/api/auth/etsy?action=connect&companyId=${companyId}`}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#F16521] hover:bg-[#D55315] text-white font-semibold rounded-xl transition-colors shadow-sm"
          >
            <ExternalLink className="w-4 h-4" />
            {isConnected ? 'Verbindung erneuern' : 'Jetzt mit Etsy verbinden'}
          </a>
        </div>
      </div>
    </div>
  )
}

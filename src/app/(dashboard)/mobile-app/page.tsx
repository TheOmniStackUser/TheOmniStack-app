import { ApiSettings } from './api-settings'

export default function MobileAppPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mobile App & API</h1>
        <p className="text-gray-500 mt-1">Verwalte den Zugriff für die mobile OmniScan App.</p>
      </div>
      
      <ApiSettings />
    </div>
  )
}

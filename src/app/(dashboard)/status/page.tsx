import React from 'react'
import { getSystemStatusData } from '@/app/actions/system-status'
import { StatusBar } from '@/components/status-bar'
import { AlertTriangle, CheckCircle2, Info, Activity } from 'lucide-react'

// Map service keys to readable names
const serviceNames: Record<string, string> = {
  'core_api': 'TheOmniStack API (Kernsystem)',
  'amazon': 'Amazon Marketplace',
  'otto': 'Otto Market',
  'shopify': 'Shopify',
  'aboutyou': 'About You',
  'dhl': 'DHL Geschäftskunden',
  'hermes': 'Hermes',
  'limango': 'Limango',
  'decathlon': 'Decathlon (Mirakl)',
  'mediamarkt': 'MediaMarkt (Mirakl)',
  'kaufland': 'Kaufland',
  'ebay': 'eBay',
  'woocommerce': 'WooCommerce',
  'shopware': 'Shopware',
}

export default async function SystemStatusPage() {
  const { incidents, uptimeData, usedServices } = await getSystemStatusData()

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <Activity className="w-8 h-8 text-cyan-500" />
          System- & Schnittstellen-Status
        </h1>
        <p className="text-slate-500 mt-2 text-sm">
          Hier findest du eine Übersicht der aktuellen Erreichbarkeit unserer Systeme sowie der von dir genutzten externen Schnittstellen.
        </p>
      </div>

      {/* Aktuelle Hinweise */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="bg-amber-400/10 border-b border-amber-400/20 px-6 py-4 flex items-center gap-3">
          <AlertTriangle className="text-amber-500 w-5 h-5" />
          <h2 className="font-semibold text-amber-700">Aktuelle Hinweise</h2>
        </div>
        <div className="p-6">
          {incidents.length === 0 ? (
            <div className="flex items-start gap-3 text-emerald-600 bg-emerald-50 rounded-xl p-4">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Alle genutzten Systeme arbeiten fehlerfrei.</p>
                <p className="text-xs mt-1 text-emerald-600/80">
                  Aktuell liegen keine Meldungen über Störungen oder geplante Wartungsarbeiten vor.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {incidents.map(incident => (
                <div key={incident.id} className="flex items-start gap-3 text-slate-800 bg-amber-50 rounded-xl p-4 border border-amber-100">
                  <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm">{serviceNames[incident.service] || incident.service}</p>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-200/50 text-amber-700">
                        {incident.status}
                      </span>
                    </div>
                    <p className="font-medium text-sm mt-1">{incident.title}</p>
                    {incident.description && (
                      <p className="text-sm mt-1 text-slate-600">{incident.description}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-2">
                      Gemeldet am: {new Date(incident.createdAt).toLocaleString('de-DE')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Uptime Overview */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Verfügbarkeit der letzten 90 Tage</h2>
          <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">Live Status</span>
        </div>
        <div className="divide-y divide-slate-50">
          {usedServices.map(service => {
            const data = uptimeData[service] || Array(90).fill(null)
            // Calculate a rough uptime percentage for the UI if we have data
            const validDays = data.filter(d => d !== null)
            const upDays = validDays.filter(d => d === 1)
            const uptimePercent = validDays.length > 0 
              ? ((upDays.length / validDays.length) * 100).toFixed(2)
              : '100.00' // fallback if no data
              
            const isOperational = data[data.length - 1] !== 0 // current status

            return (
              <div key={service} className="p-6 transition-colors hover:bg-slate-50/50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-800 text-sm">{serviceNames[service] || service}</h3>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-medium text-slate-500">
                      {uptimePercent}% Uptime
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      isOperational ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {isOperational ? 'Operational' : 'Issues'}
                    </span>
                  </div>
                </div>
                
                <StatusBar data={data} days={90} />
                
                <div className="flex justify-between items-center mt-2 text-[10px] text-slate-400 font-medium px-1">
                  <span>Vor 90 Tagen</span>
                  <span>Heute</span>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

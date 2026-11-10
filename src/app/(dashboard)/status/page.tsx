import React from 'react'
import { getSystemStatusData } from '@/app/actions/system-status'
import { AlertTriangle, CheckCircle2, Info, Activity, Wrench } from 'lucide-react'
import { serviceNamesMap, serviceCategoryMap, serviceCategoryConfig } from '@/db/schema/system-status'
import { StatusView } from './status-view'

export default async function SystemStatusPage() {
  const { incidents, uptimeData, usedServices, overrides, connectedServices } = await getSystemStatusData()

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <Activity className="w-8 h-8 text-cyan-500" />
          System- & Schnittstellen-Status
        </h1>
        <p className="text-slate-500 mt-2 text-sm">
          Hier findest du eine strukturierte Übersicht der aktuellen Erreichbarkeit unserer Systeme, Marktplätze und Versanddienstleister.
        </p>
      </div>

      {/* Aktuelle Hinweise */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="bg-amber-400/10 border-b border-amber-400/20 px-6 py-4 flex items-center gap-3">
          <AlertTriangle className="text-amber-500 w-5 h-5" />
          <h2 className="font-semibold text-amber-700">Aktuelle Hinweise & Wartungen</h2>
        </div>
        <div className="p-6">
          {incidents.length === 0 ? (
            <div className="flex items-start gap-3 text-emerald-600 bg-emerald-50 rounded-xl p-4">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Alle genutzten Systeme und Schnittstellen arbeiten fehlerfrei.</p>
                <p className="text-xs mt-1 text-emerald-600/80">
                  Aktuell liegen keine Meldungen über Störungen oder geplante Wartungsarbeiten vor.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {incidents.map(incident => {
                const isMaintenance = incident.status === 'maintenance'
                const categoryKey = serviceCategoryMap[incident.service]
                const category = categoryKey ? serviceCategoryConfig[categoryKey] : null
                
                const containerClass = isMaintenance 
                  ? "flex items-start gap-3 text-slate-800 bg-blue-50/80 rounded-xl p-4 border border-blue-100"
                  : "flex items-start gap-3 text-slate-800 bg-amber-50 rounded-xl p-4 border border-amber-100"
                  
                const Icon = isMaintenance ? Wrench : Info
                const iconColor = isMaintenance ? "text-blue-500" : "text-amber-500"
                const badgeClass = isMaintenance
                  ? "bg-blue-200/50 text-blue-700"
                  : "bg-amber-200/50 text-amber-700"

                return (
                  <div key={incident.id} className={containerClass}>
                    <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm">{serviceNamesMap[incident.service] || incident.service}</p>
                        {category && (
                          <span className="text-[10px] font-semibold text-slate-600 bg-white/80 border border-slate-200/80 px-2 py-0.5 rounded-md">
                            {category.shortTitle}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeClass}`}>
                          {incident.status}
                        </span>
                      </div>
                      <p className="font-medium text-sm mt-1">{incident.title}</p>
                      {incident.description && (
                        <p className="text-sm mt-1 text-slate-600">{incident.description}</p>
                      )}
                      
                      {isMaintenance && incident.startTime && (
                        <div className="mt-3 bg-white/50 rounded-lg p-2 text-xs text-slate-600 border border-blue-100/50">
                          <p className="font-semibold mb-0.5 text-blue-800">Geplanter Zeitraum:</p>
                          <p>Start: {new Date(incident.startTime).toLocaleString('de-DE')}</p>
                          <p>Ende: {incident.endTime ? new Date(incident.endTime).toLocaleString('de-DE') : 'Unbekannt'}</p>
                        </div>
                      )}
                      
                      <p className="text-xs text-slate-400 mt-2">
                        Gemeldet am: {new Date(incident.createdAt).toLocaleString('de-DE')}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Categorized Uptime and System Status */}
      <StatusView 
        usedServices={usedServices} 
        connectedServices={connectedServices} 
        uptimeData={uptimeData} 
        overrides={overrides} 
      />
    </div>
  )
}


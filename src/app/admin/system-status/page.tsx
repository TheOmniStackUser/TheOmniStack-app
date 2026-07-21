import React from 'react'
import { getAdminIncidents, createIncident, resolveIncident, getOverrideStatuses } from './actions'
import { AlertCircle, Plus, CheckCircle2 } from 'lucide-react'
import { systemServicesEnum, incidentStatusEnum } from '@/db/schema/system-status'

import { CreateIncidentForm } from './create-incident-form'
import { LiveStatusOverride } from './live-status-override'

export default async function AdminSystemStatusPage() {
  const incidents = await getAdminIncidents()
  const { overrides, autoStatus } = await getOverrideStatuses()

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <AlertCircle className="w-8 h-8 text-indigo-500" />
          System Status & Incidents
        </h1>
        <p className="text-white/60 mt-2 text-sm">
          Manage system incidents and maintenance windows. These will be visible to merchants who use the affected integration.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 sticky top-8">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-500" /> Neues Ereignis melden
            </h2>
            <CreateIncidentForm />
          </div>
          
          <LiveStatusOverride overrides={overrides} autoStatus={autoStatus} />
        </div>

        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-semibold text-white text-lg">Vorfälle & Wartungen</h2>
          {incidents.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200/60 border-dashed">
              <p className="text-slate-500 text-sm">Keine Vorfälle protokolliert.</p>
            </div>
          ) : (
            incidents.map(incident => (
              <div key={incident.id} className={`bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 ${incident.status === 'resolved' ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        {incident.service}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        incident.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                        incident.status === 'maintenance' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {incident.status}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-base">{incident.title}</h3>
                    {incident.description && (
                      <p className="text-slate-600 text-sm mt-1 whitespace-pre-wrap">{incident.description}</p>
                    )}
                    <div className="text-xs text-slate-400 mt-3">
                      Gemeldet: {new Date(incident.createdAt).toLocaleString('de-DE')}
                      {incident.endTime && ` • Gelöst: ${new Date(incident.endTime).toLocaleString('de-DE')}`}
                    </div>
                  </div>
                  
                  {incident.status !== 'resolved' && (
                    <form action={async () => {
                      'use server'
                      await resolveIncident(incident.id)
                    }}>
                      <button type="submit" className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors">
                        <CheckCircle2 className="w-4 h-4" /> Als gelöst markieren
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

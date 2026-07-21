import React from 'react'
import { getAdminIncidents, createIncident, resolveIncident } from './actions'
import { AlertCircle, Plus, CheckCircle2 } from 'lucide-react'
import { systemServicesEnum, incidentStatusEnum } from '@/db/schema/system-status'

export default async function AdminSystemStatusPage() {
  const incidents = await getAdminIncidents()

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <AlertCircle className="w-8 h-8 text-indigo-500" />
          System Status & Incidents
        </h1>
        <p className="text-slate-500 mt-2 text-sm">
          Manage system incidents and maintenance windows. These will be visible to merchants who use the affected integration.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 sticky top-8">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-500" /> Neues Ereignis melden
            </h2>
            <form action={async (formData) => {
              'use server'
              const service = formData.get('service') as typeof systemServicesEnum.enumValues[number]
              const title = formData.get('title') as string
              const description = formData.get('description') as string
              const status = formData.get('status') as typeof incidentStatusEnum.enumValues[number]
              
              if (service && title && status) {
                await createIncident({ service, title, description, status })
              }
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Betroffener Service</label>
                <select name="service" required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900">
                  {systemServicesEnum.enumValues.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                <select name="status" required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900">
                  <option value="investigating">Untersuchung läuft</option>
                  <option value="identified">Problem identifiziert</option>
                  <option value="monitoring">Beobachtung (Monitoring)</option>
                  <option value="resolved">Problem gelöst</option>
                  <option value="maintenance">Geplante Wartung</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Titel</label>
                <input type="text" name="title" required placeholder="Kurze Beschreibung des Vorfalls" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 placeholder:text-slate-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Details (Optional)</label>
                <textarea name="description" rows={3} placeholder="Ausführliche Informationen..." className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 placeholder:text-slate-500 resize-none" />
              </div>

              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors shadow-sm">
                Ereignis erstellen
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-semibold text-slate-800 text-lg">Vorfälle & Wartungen</h2>
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

'use client'

import React, { useState } from 'react'
import { createIncident } from './actions'
import { systemServicesEnum, incidentStatusEnum } from '@/db/schema/system-status'

export function CreateIncidentForm() {
  const [status, setStatus] = useState<typeof incidentStatusEnum.enumValues[number]>('investigating')

  return (
    <form action={async (formData) => {
      const service = formData.get('service') as typeof systemServicesEnum.enumValues[number]
      const title = formData.get('title') as string
      const description = formData.get('description') as string
      const statusValue = formData.get('status') as typeof incidentStatusEnum.enumValues[number]
      
      const startTimeStr = formData.get('startTime') as string
      const endTimeStr = formData.get('endTime') as string
      
      const startTime = startTimeStr ? new Date(startTimeStr) : undefined
      const endTime = endTimeStr ? new Date(endTimeStr) : undefined
      
      if (service && title && statusValue) {
        await createIncident({ service, title, description, status: statusValue, startTime, endTime })
        // Optional: reset form or show success message
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
        <select 
          name="status" 
          required 
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900"
        >
          <option value="investigating">Untersuchung läuft</option>
          <option value="identified">Problem identifiziert</option>
          <option value="monitoring">Beobachtung (Monitoring)</option>
          <option value="resolved">Problem gelöst</option>
          <option value="maintenance">Geplante Wartung</option>
        </select>
      </div>

      {status === 'maintenance' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Startzeitpunkt</label>
            <input type="datetime-local" name="startTime" required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Endzeitpunkt</label>
            <input type="datetime-local" name="endTime" required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900" />
          </div>
        </div>
      )}

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
  )
}

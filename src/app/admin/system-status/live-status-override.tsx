'use client'

import React from 'react'
import { setOverrideStatus } from './actions'
import { systemServicesEnum } from '@/db/schema/system-status'

export function LiveStatusOverride({ overrides }: { overrides: Record<string, string> }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6">
      <h2 className="font-semibold text-slate-800 mb-4">Live Status Override</h2>
      <p className="text-xs text-slate-500 mb-4">
        Überschreibe den Live-Status eines Services manuell. 'Auto' nutzt das automatische Monitoring.
      </p>
      
      <div className="space-y-3">
        {systemServicesEnum.enumValues.map(service => {
          const currentStatus = overrides[service] || 'auto'
          
          return (
            <div key={service} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
              <span className="text-sm font-medium text-slate-700">{service}</span>
              <select 
                value={currentStatus}
                onChange={async (e) => {
                  await setOverrideStatus(service, e.target.value as any)
                }}
                className={`text-xs font-semibold rounded-md px-2 py-1 border-0 ring-1 ring-inset focus:ring-2 focus:ring-indigo-500 ${
                  currentStatus === 'online' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                  currentStatus === 'offline' ? 'bg-rose-50 text-rose-700 ring-rose-200' :
                  'bg-slate-50 text-slate-600 ring-slate-200'
                }`}
              >
                <option value="auto">Auto</option>
                <option value="online">Force Online</option>
                <option value="offline">Force Offline</option>
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

'use client'

import React from 'react'
import { setOverrideStatus } from './actions'
import { 
  systemServicesEnum, 
  serviceNamesMap, 
  serviceCategoryMap, 
  serviceCategoryConfig, 
  serviceCategoryOrder 
} from '@/db/schema/system-status'

export function LiveStatusOverride({ 
  overrides, 
  autoStatus 
}: { 
  overrides: Record<string, string>,
  autoStatus: Record<string, boolean>
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6">
      <h2 className="font-semibold text-slate-800 mb-1">Live Status Override</h2>
      <p className="text-xs text-slate-500 mb-6">
        Überschreibe den Live-Status eines Services manuell. 'Auto' nutzt das automatische Monitoring.
      </p>
      
      <div className="space-y-6">
        {serviceCategoryOrder.map(catKey => {
          const config = serviceCategoryConfig[catKey]
          const servicesInCat = systemServicesEnum.enumValues.filter(s => serviceCategoryMap[s] === catKey)
          if (servicesInCat.length === 0) return null

          return (
            <div key={catKey} className="space-y-2">
              <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {config.title}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">({servicesInCat.length})</span>
              </div>

              <div className="space-y-1.5">
                {servicesInCat.map(service => {
                  const currentStatus = overrides[service] || 'auto'
                  const isOnline = currentStatus === 'online' ? true 
                                 : currentStatus === 'offline' ? false 
                                 : autoStatus[service]
                  
                  return (
                    <div key={service} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} />
                        <span className="text-xs font-medium text-slate-700">{serviceNamesMap[service] || service}</span>
                      </div>
                      <select 
                        value={currentStatus}
                        onChange={async (e) => {
                          await setOverrideStatus(service, e.target.value as any)
                        }}
                        className={`text-[11px] font-semibold rounded-md px-2 py-1 border-0 ring-1 ring-inset focus:ring-2 focus:ring-indigo-500 ${
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
        })}
      </div>
    </div>
  )
}

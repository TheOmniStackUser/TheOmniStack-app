'use client'

import React, { useState, useMemo } from 'react'
import { StatusBar } from '@/components/status-bar'
import { 
  serviceNamesMap, 
  serviceCategoryMap, 
  serviceCategoryConfig, 
  serviceCategoryOrder, 
  serviceBrandMap,
  ServiceCategory 
} from '@/db/schema/system-status'
import { 
  Store, 
  Truck, 
  ShoppingCart, 
  Server, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  X, 
  Check, 
  Layers
} from 'lucide-react'

interface StatusViewProps {
  usedServices: string[]
  connectedServices: string[]
  uptimeData: Record<string, (1 | 0 | null)[]>
  overrides: Record<string, string>
}

const categoryIcons = {
  marketplace: Store,
  shipping: Truck,
  shop: ShoppingCart,
  platform: Server,
}

export function StatusView({
  usedServices,
  connectedServices,
  uptimeData,
  overrides,
}: StatusViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [onlyConnected, setOnlyConnected] = useState(false)

  // Compute operational status for each service
  const serviceStatusMap = useMemo(() => {
    const map: Record<string, { isOperational: boolean; uptimePercent: string }> = {}
    
    for (const service of usedServices) {
      const data = uptimeData[service] || Array(90).fill(null)
      const validDays = data.filter(d => d !== null)
      const upDays = validDays.filter(d => d === 1)
      const uptimePercent = validDays.length > 0
        ? ((upDays.length / validDays.length) * 100).toFixed(2)
        : '100.00'

      const override = overrides[service]
      const isOperational = override === 'online' ? true 
                          : override === 'offline' ? false 
                          : data[data.length - 1] !== 0

      map[service] = { isOperational, uptimePercent }
    }
    return map
  }, [usedServices, uptimeData, overrides])

  // Count metrics overall and per category
  const metrics = useMemo(() => {
    const total = usedServices.length
    const totalOperational = usedServices.filter(s => serviceStatusMap[s]?.isOperational).length
    const allOperational = total > 0 && totalOperational === total

    const categoryStats: Record<ServiceCategory, { total: number; operational: number }> = {
      marketplace: { total: 0, operational: 0 },
      shipping: { total: 0, operational: 0 },
      shop: { total: 0, operational: 0 },
      platform: { total: 0, operational: 0 },
    }

    for (const service of usedServices) {
      const cat = serviceCategoryMap[service] || 'marketplace'
      categoryStats[cat].total += 1
      if (serviceStatusMap[service]?.isOperational) {
        categoryStats[cat].operational += 1
      }
    }

    return { total, totalOperational, allOperational, categoryStats }
  }, [usedServices, serviceStatusMap])

  // Filter services
  const filteredServicesByCategory = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    const result: Record<ServiceCategory, string[]> = {
      marketplace: [],
      shipping: [],
      shop: [],
      platform: [],
    }

    for (const service of usedServices) {
      const cat = serviceCategoryMap[service] || 'marketplace'
      const name = (serviceNamesMap[service] || service).toLowerCase()
      const brand = (serviceBrandMap[service]?.badgeText || '').toLowerCase()

      if (query && !name.includes(query) && !brand.includes(query) && !service.toLowerCase().includes(query)) {
        continue
      }

      if (onlyConnected && !connectedServices.includes(service)) {
        continue
      }

      result[cat].push(service)
    }

    return result
  }, [usedServices, searchQuery, onlyConnected, connectedServices])

  const totalFilteredCount = useMemo(() => {
    return Object.values(filteredServicesByCategory).reduce((acc, list) => acc + list.length, 0)
  }, [filteredServicesByCategory])

  return (
    <div className="space-y-8">
      {/* Overall Health Status Banner */}
      <div className={`rounded-2xl p-6 border transition-all duration-300 ${
        metrics.allOperational
          ? 'bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-teal-500/10 border-emerald-500/20'
          : 'bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-rose-500/10 border-amber-500/30'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              metrics.allOperational
                ? 'bg-emerald-500/20 text-emerald-600'
                : 'bg-amber-500/20 text-amber-600'
            }`}>
              {metrics.allOperational ? (
                <CheckCircle2 className="w-6 h-6" />
              ) : (
                <AlertCircle className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                  metrics.allOperational ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-ping'
                }`} />
                <h2 className="text-lg font-bold text-slate-900">
                  {metrics.allOperational
                    ? 'Alle Systeme uneingeschränkt betriebsbereit'
                    : `${metrics.total - metrics.totalOperational} von ${metrics.total} Systemen melden Störungen`}
                </h2>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {metrics.allOperational
                  ? `Alle ${metrics.total} Schnittstellen (Marktplätze, Versanddienstleister & Shops) arbeiten planmäßig.`
                  : 'Einige Schnittstellen verzeichnen Verzögerungen oder Ausfälle. Siehe Details unten.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/80 border border-slate-200/80 text-slate-700 shadow-sm">
              {metrics.totalOperational} / {metrics.total} Systeme online
            </span>
          </div>
        </div>
      </div>

      {/* KPI Overview Cards for 4 Categories */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {serviceCategoryOrder.map(catKey => {
          const config = serviceCategoryConfig[catKey]
          const Icon = categoryIcons[catKey]
          const stats = metrics.categoryStats[catKey]
          const isAllUp = stats.total > 0 && stats.operational === stats.total
          const isSelected = selectedCategory === catKey

          return (
            <button
              key={catKey}
              onClick={() => setSelectedCategory(isSelected ? 'all' : catKey)}
              className={`p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                isSelected 
                  ? 'bg-indigo-50/60 border-indigo-400 shadow-sm ring-2 ring-indigo-500/20' 
                  : 'bg-white border-slate-200/70 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  isAllUp ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {isAllUp ? '100% Online' : `${stats.operational}/${stats.total} Online`}
                </span>
              </div>
              <h3 className="font-semibold text-slate-900 text-sm">{config.title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {stats.total} {catKey === 'shipping' ? 'Paketdienste' : catKey === 'marketplace' ? 'Marktplätze' : 'Dienste'}
              </p>
            </button>
          )
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/60 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Alle ({metrics.total})
            </button>
            {serviceCategoryOrder.map(catKey => {
              const config = serviceCategoryConfig[catKey]
              const count = metrics.categoryStats[catKey].total
              return (
                <button
                  key={catKey}
                  onClick={() => setSelectedCategory(catKey)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    selectedCategory === catKey
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {config.shortTitle} ({count})
                </button>
              )
            })}
          </div>

          {/* Quick Search & Only-Connected Toggle */}
          <div className="flex items-center gap-3">
            {connectedServices.length > 0 && (
              <button
                type="button"
                onClick={() => setOnlyConnected(!onlyConnected)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors whitespace-nowrap ${
                  onlyConnected
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Check className={`w-3.5 h-3.5 ${onlyConnected ? 'text-indigo-600' : 'text-slate-400'}`} />
                Nur meine Integrationen ({connectedServices.length})
              </button>
            )}

            <div className="relative min-w-[200px] flex-1 sm:flex-none">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Dienst suchen..."
                className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Categorized Service Lists */}
      {totalFilteredCount === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/60 shadow-sm">
          <Layers className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-800 text-sm">Keine Dienste gefunden</h3>
          <p className="text-xs text-slate-500 mt-1">
            {searchQuery 
              ? `Keine Ergebnisse für "${searchQuery}". Überprüfe deine Filtereinstellungen.` 
              : 'Keine Dienste entsprechen den gewählten Kriterien.'}
          </p>
          {(searchQuery || onlyConnected || selectedCategory !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('')
                setOnlyConnected(false)
                setSelectedCategory('all')
              }}
              className="mt-4 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {serviceCategoryOrder.map(catKey => {
            if (selectedCategory !== 'all' && selectedCategory !== catKey) {
              return null
            }

            const services = filteredServicesByCategory[catKey]
            if (services.length === 0) return null

            const config = serviceCategoryConfig[catKey]
            const Icon = categoryIcons[catKey]
            const categoryStats = metrics.categoryStats[catKey]
            const isCatAllUp = categoryStats.total > 0 && categoryStats.operational === categoryStats.total

            return (
              <section 
                key={catKey} 
                className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden"
              >
                {/* Category Header */}
                <div className="px-6 py-4 bg-slate-50/60 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-xs">
                      <Icon className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-slate-900 text-base">{config.title}</h2>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-600">
                          {services.length}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{config.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                      isCatAllUp ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {isCatAllUp ? 'Alle operational' : 'Teilweiser Ausfall'}
                    </span>
                  </div>
                </div>

                {/* Service Rows */}
                <div className="divide-y divide-slate-100">
                  {services.map(service => {
                    const status = serviceStatusMap[service] || { isOperational: true, uptimePercent: '100.00' }
                    const data = uptimeData[service] || Array(90).fill(null)
                    const brand = serviceBrandMap[service] || { badgeText: service.slice(0, 3).toUpperCase(), bgClass: 'bg-slate-100 border-slate-200', textClass: 'text-slate-700' }
                    const isConnected = connectedServices.includes(service)

                    return (
                      <div 
                        key={service} 
                        className="p-6 transition-colors hover:bg-slate-50/60"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            {/* Brand Badge */}
                            <div className={`w-11 h-7 rounded-md border flex items-center justify-center font-bold text-xs shrink-0 tracking-tight shadow-xs ${brand.bgClass} ${brand.textClass}`}>
                              {brand.badgeText}
                            </div>
                            
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-slate-900 text-sm">
                                  {serviceNamesMap[service] || service}
                                </h3>
                                {isConnected && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">
                                    <Check className="w-2.5 h-2.5" /> Verbunden
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-center">
                            <span className="text-xs font-semibold text-slate-500">
                              {status.uptimePercent}% Uptime
                            </span>
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                              status.isOperational 
                                ? 'bg-emerald-100 text-emerald-700' 
                                : 'bg-rose-100 text-rose-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                status.isOperational ? 'bg-emerald-500' : 'bg-rose-500 animate-ping'
                              }`} />
                              {status.isOperational ? 'Operational' : 'Issues'}
                            </span>
                          </div>
                        </div>

                        {/* 90-day History Bar */}
                        <div className="mt-3">
                          <StatusBar data={data} days={90} />
                          <div className="flex justify-between items-center mt-2 text-[10px] text-slate-400 font-medium px-1">
                            <span>Vor 90 Tagen</span>
                            <span className="font-semibold text-slate-500">90-Tage Verfügbarkeitsverlauf</span>
                            <span>Heute</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'

import React, { useState, useEffect } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts'
import type { 
  TimelineDataPoint, 
  MarketplacePerformanceData, 
  ProductPerformanceData 
} from './types'

const MARKETPLACE_COLORS = [
  '#06B6D4', // cyan-500
  '#3B82F6', // blue-500
  '#6366F1', // indigo-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
  '#F59E0B', // amber-500
  '#10B981', // emerald-500
  '#F97316', // orange-500
  '#14B8A6', // teal-500
  '#64748B', // slate-500
]

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)
}

function formatCurrencyFull(val: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(val)
}

// Custom Glassmorphic Dark Tooltip
function CustomTimelineTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const data: TimelineDataPoint = payload[0].payload
    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-xl shadow-xl border border-slate-700/80 text-xs space-y-1.5 min-w-[170px]">
        <p className="font-semibold text-slate-300 border-b border-slate-700/80 pb-1">{data.label} ({data.date})</p>
        <div className="flex justify-between items-center text-cyan-400 font-medium">
          <span>Umsatz:</span>
          <span className="font-bold">{formatCurrencyFull(data.revenue)}</span>
        </div>
        <div className="flex justify-between items-center text-blue-300">
          <span>Bestellungen:</span>
          <span className="font-bold text-white">{data.orders}</span>
        </div>
        <div className="flex justify-between items-center text-indigo-300">
          <span>Einheiten:</span>
          <span className="font-bold text-white">{data.units}</span>
        </div>
      </div>
    )
  }
  return null
}

export function RevenueOrdersTimelineChart({ data }: { data: TimelineDataPoint[] }) {
  const [mounted, setMounted] = useState(false)
  const [viewMetric, setViewMetric] = useState<'both' | 'revenue' | 'orders'>('both')

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-[320px] w-full bg-slate-100/50 rounded-xl animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[320px] flex items-center justify-center text-sm text-slate-500">
        Keine Daten für den ausgewählten Zeitraum vorhanden
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Umsatz & Bestellverlauf</h4>
          <p className="text-xs text-slate-500">Tägliche Entwicklung im ausgewählten Zeitraum</p>
        </div>
        <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
          <button
            onClick={() => setViewMetric('both')}
            className={`px-3 py-1 rounded-md transition-all ${
              viewMetric === 'both' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Kombiniert
          </button>
          <button
            onClick={() => setViewMetric('revenue')}
            className={`px-3 py-1 rounded-md transition-all ${
              viewMetric === 'revenue' ? 'bg-white text-cyan-600 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Nur Umsatz
          </button>
          <button
            onClick={() => setViewMetric('orders')}
            className={`px-3 py-1 rounded-md transition-all ${
              viewMetric === 'orders' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Nur Bestellungen
          </button>
        </div>
      </div>

      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#94A3B8"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#E2E8F0' }}
            />
            {/* Left Y Axis for Revenue */}
            {(viewMetric === 'both' || viewMetric === 'revenue') && (
              <YAxis
                yAxisId="left"
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => formatCurrency(val)}
              />
            )}
            {/* Right Y Axis for Orders */}
            {(viewMetric === 'both' || viewMetric === 'orders') && (
              <YAxis
                yAxisId="right"
                orientation={viewMetric === 'both' ? 'right' : 'left'}
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${val}`}
              />
            )}
            <Tooltip content={<CustomTimelineTooltip />} />
            
            {(viewMetric === 'both' || viewMetric === 'revenue') && (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="revenue"
                name="Umsatz"
                stroke="#06B6D4"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#revenueGradient)"
              />
            )}

            {(viewMetric === 'both' || viewMetric === 'orders') && (
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="orders"
                name="Bestellungen"
                stroke="#3B82F6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#ordersGradient)"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// Marketplace Donut Chart
export function MarketplaceDonutChart({ data }: { data: MarketplacePerformanceData[] }) {
  const [mounted, setMounted] = useState(false)
  const [metric, setMetric] = useState<'revenue' | 'orders'>('revenue')

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-[280px] w-full bg-slate-100/50 rounded-xl animate-pulse" />
  }

  const chartData = data
    .filter(d => (metric === 'revenue' ? d.revenue : d.orderCount) > 0)
    .map(d => ({
      name: d.name,
      value: metric === 'revenue' ? d.revenue : d.orderCount,
      share: metric === 'revenue' ? d.revenueShare : d.orderShare,
      formattedValue: metric === 'revenue' ? formatCurrencyFull(d.revenue) : `${d.orderCount} Bestellungen`
    }))

  if (chartData.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-sm text-slate-500">
        Keine Marktplatz-Verkäufe im gewählten Zeitraum
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">Marktplatz-Anteile</h4>
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
          <button
            onClick={() => setMetric('revenue')}
            className={`px-2.5 py-1 rounded-md transition-all ${
              metric === 'revenue' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600'
            }`}
          >
            Umsatz
          </button>
          <button
            onClick={() => setMetric('orders')}
            className={`px-2.5 py-1 rounded-md transition-all ${
              metric === 'orders' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600'
            }`}
          >
            Bestellungen
          </button>
        </div>
      </div>

      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={4}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={MARKETPLACE_COLORS[index % MARKETPLACE_COLORS.length]} 
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload
                  return (
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-2.5 rounded-lg text-xs shadow-xl border border-slate-700">
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-cyan-400 font-bold">{item.formattedValue}</p>
                      <p className="text-slate-400">{item.share}% Anteil</p>
                    </div>
                  )
                }
                return null
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              formatter={(value) => <span className="text-xs text-slate-700 font-medium">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// Marketplace Bar Chart
export function MarketplaceBarChart({ data }: { data: MarketplacePerformanceData[] }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-[280px] w-full bg-slate-100/50 rounded-xl animate-pulse" />
  }

  const topMarketplaces = data.slice(0, 7)

  if (topMarketplaces.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-sm text-slate-500">
        Keine Marktplatz-Daten vorhanden
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">Umsatz pro Marktplatz</h4>
        <p className="text-xs text-slate-500">Vergleich der absatzstärksten Kanäle</p>
      </div>

      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={topMarketplaces} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="name"
              stroke="#94A3B8"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#E2E8F0' }}
            />
            <YAxis
              stroke="#94A3B8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => formatCurrency(val)}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload as MarketplacePerformanceData
                  return (
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-xl text-xs shadow-xl border border-slate-700 space-y-1">
                      <p className="font-semibold text-white border-b border-slate-700 pb-1">{item.name}</p>
                      <p className="text-cyan-400 font-bold">{formatCurrencyFull(item.revenue)}</p>
                      <p className="text-slate-300">{item.orderCount} Bestellungen ({item.unitsSold} Stk.)</p>
                      <p className="text-slate-400">Ø Warenkorb: {formatCurrencyFull(item.averageOrderValue)}</p>
                    </div>
                  )
                }
                return null
              }}
            />
            <Bar dataKey="revenue" name="Umsatz" radius={[6, 6, 0, 0]}>
              {topMarketplaces.map((entry, index) => (
                <Cell 
                  key={`cell-bar-${index}`} 
                  fill={MARKETPLACE_COLORS[index % MARKETPLACE_COLORS.length]} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// Top Products Horizontal Bar Chart
export function TopProductsBarChart({ 
  products,
  metric = 'revenue',
  onSelectSku
}: { 
  products: ProductPerformanceData[]
  metric?: 'revenue' | 'units'
  onSelectSku?: (sku: string) => void
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-[300px] w-full bg-slate-100/50 rounded-xl animate-pulse" />
  }

  const topProducts = (metric === 'revenue' 
    ? [...products].sort((a, b) => b.revenue - a.revenue)
    : [...products].sort((a, b) => b.unitsSold - a.unitsSold)
  ).slice(0, 6)

  if (topProducts.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-sm text-slate-500">
        Keine Produktverkäufe im gewählten Zeitraum
      </div>
    )
  }

  const chartData = topProducts.map(p => ({
    ...p,
    shortTitle: p.title.length > 24 ? p.title.slice(0, 24) + '...' : p.title
  }))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Top 6 Produkte {metric === 'revenue' ? 'nach Umsatz' : 'nach verkauften Stück'}
          </h4>
          <p className="text-xs text-slate-500">Klicke auf ein Produkt für Detailanalysen</p>
        </div>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            onClick={(state: any) => {
              if (state && state.activePayload && state.activePayload.length && onSelectSku) {
                const sku = state.activePayload[0].payload.sku
                onSelectSku(sku)
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
            <XAxis
              type="number"
              stroke="#94A3B8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => metric === 'revenue' ? formatCurrency(val) : `${val}`}
            />
            <YAxis
              type="category"
              dataKey="shortTitle"
              stroke="#475569"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={140}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const p = payload[0].payload as ProductPerformanceData
                  return (
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-xl text-xs shadow-xl border border-slate-700 space-y-1 max-w-xs">
                      <p className="font-semibold text-white">{p.title}</p>
                      <p className="text-[10px] text-slate-400 font-mono">SKU: {p.sku}</p>
                      <div className="pt-1.5 border-t border-slate-700/80 space-y-1">
                        <p className="text-cyan-400 font-bold">Umsatz: {formatCurrencyFull(p.revenue)}</p>
                        <p className="text-slate-300">Verkauft: {p.unitsSold} Stk.</p>
                        <p className="text-slate-300">Ø Preis: {formatCurrencyFull(p.averagePrice)}</p>
                        {p.returnCount > 0 && (
                          <p className="text-rose-400">Retouren: {p.returnCount} ({p.returnRate}%)</p>
                        )}
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Bar
              dataKey={metric === 'revenue' ? 'revenue' : 'unitsSold'}
              fill="#06B6D4"
              radius={[0, 6, 6, 0]}
              className="cursor-pointer hover:opacity-90 transition-opacity"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// Single Product Drilldown Timeline Chart
export function ProductTimelineChart({ data }: { data: { date: string; label: string; revenue: number; units: number }[] }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-[200px] w-full bg-slate-100 rounded-lg animate-pulse" />
  }

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="productRevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
          <XAxis dataKey="label" stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => formatCurrency(v)} />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload
                return (
                  <div className="bg-slate-900/95 backdrop-blur-md text-white p-2.5 rounded-lg text-xs shadow-xl border border-slate-700">
                    <p className="font-semibold text-slate-300">{item.label}</p>
                    <p className="text-cyan-400 font-bold">{formatCurrencyFull(item.revenue)}</p>
                    <p className="text-slate-300">{item.units} Einheiten</p>
                  </div>
                )
              }
              return null
            }}
          />
          <Area type="monotone" dataKey="revenue" stroke="#06B6D4" strokeWidth={2} fill="url(#productRevGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

'use client'

import React, { useState, useEffect } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
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

// Custom Glassmorphic Dark Tooltip with YoY Comparison
function CustomTimelineTooltip({ active, payload, label, showPrevYear, showPrevYear2 }: any) {
  if (active && payload && payload.length) {
    const data: TimelineDataPoint = payload[0].payload
    const pyRev = data.prevYearRevenue ?? 0
    const pyOrd = data.prevYearOrders ?? 0
    const revDiff = pyRev > 0 ? Number((((data.revenue - pyRev) / pyRev) * 100).toFixed(1)) : null

    const py2Rev = data.prevYear2Revenue ?? 0
    const py2Ord = data.prevYear2Orders ?? 0
    const rev2Diff = py2Rev > 0 ? Number((((data.revenue - py2Rev) / py2Rev) * 100).toFixed(1)) : null

    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-xl shadow-xl border border-slate-700/80 text-xs space-y-2 min-w-[210px]">
        <p className="font-semibold text-slate-300 border-b border-slate-700/80 pb-1">
          {data.label} ({data.date})
        </p>

        {/* Current values */}
        <div className="space-y-1">
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

        {/* Vorjahr N-1 */}
        {showPrevYear && (
          <div className="pt-1.5 border-t border-slate-700/80 space-y-1 text-amber-300">
            <div className="flex justify-between items-center font-medium">
              <span>Vorjahr ({data.prevYearDate}):</span>
              <span className="font-bold">{formatCurrencyFull(pyRev)}</span>
            </div>
            {revDiff !== null && (
              <div className="flex justify-between items-center text-[11px] text-slate-300">
                <span>YoY Veränderung:</span>
                <span className={revDiff >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {revDiff >= 0 ? `+${revDiff}%` : `${revDiff}%`}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center text-[11px] text-slate-300">
              <span>Vorjahr Bestellungen:</span>
              <span className="font-semibold text-white">{pyOrd}</span>
            </div>
          </div>
        )}

        {/* Vor-Vorjahr N-2 */}
        {showPrevYear2 && (
          <div className="pt-1.5 border-t border-slate-700/80 space-y-1 text-purple-300">
            <div className="flex justify-between items-center font-medium">
              <span>Vor-Vorjahr ({data.prevYear2Date}):</span>
              <span className="font-bold">{formatCurrencyFull(py2Rev)}</span>
            </div>
            {rev2Diff !== null && (
              <div className="flex justify-between items-center text-[11px] text-slate-300">
                <span>YoY Veränderung:</span>
                <span className={rev2Diff >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {rev2Diff >= 0 ? `+${rev2Diff}%` : `${rev2Diff}%`}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center text-[11px] text-slate-300">
              <span>Vor-Vorjahr Bestellungen:</span>
              <span className="font-semibold text-white">{py2Ord}</span>
            </div>
          </div>
        )}
      </div>
    )
  }
  return null
}

export function RevenueOrdersTimelineChart({ 
  data,
  previousYearSummary,
  previousYear2Summary
}: { 
  data: TimelineDataPoint[]
  previousYearSummary?: {
    year: number
    totalRevenue: number
    totalOrders: number
    growthPercentRevenue: number
    growthPercentOrders: number
  }
  previousYear2Summary?: {
    year: number
    totalRevenue: number
    totalOrders: number
    growthPercentRevenue: number
    growthPercentOrders: number
  }
}) {
  const [mounted, setMounted] = useState(false)
  const [viewMetric, setViewMetric] = useState<'both' | 'revenue' | 'orders'>('both')
  const [showPrevYear, setShowPrevYear] = useState(false)
  const [showPrevYear2, setShowPrevYear2] = useState(false)

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Umsatz & Bestellverlauf</h4>
          <p className="text-xs text-slate-500">Tägliche Entwicklung im ausgewählten Zeitraum</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Vorjahres-Vergleich Toggles */}
          <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase px-1">Vergleich:</span>
            <button
              onClick={() => setShowPrevYear(!showPrevYear)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                showPrevYear
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="Vorjahr (-1 Jahr) einblenden"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${showPrevYear ? 'bg-white' : 'bg-amber-500'}`} />
              Vorjahr {previousYearSummary ? `(${previousYearSummary.year})` : '(-1J)'}
            </button>
            <button
              onClick={() => setShowPrevYear2(!showPrevYear2)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                showPrevYear2
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="Vor-Vorjahr (-2 Jahre) einblenden"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${showPrevYear2 ? 'bg-white' : 'bg-violet-500'}`} />
              Vor-Vorjahr {previousYear2Summary ? `(${previousYear2Summary.year})` : '(-2J)'}
            </button>
          </div>

          {/* Metric View Mode */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setViewMetric('both')}
              className={`px-3 py-1 rounded-lg transition-all ${
                viewMetric === 'both' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kombiniert
            </button>
            <button
              onClick={() => setViewMetric('revenue')}
              className={`px-3 py-1 rounded-lg transition-all ${
                viewMetric === 'revenue' ? 'bg-white text-cyan-600 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nur Umsatz
            </button>
            <button
              onClick={() => setViewMetric('orders')}
              className={`px-3 py-1 rounded-lg transition-all ${
                viewMetric === 'orders' ? 'bg-white text-blue-600 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nur Bestellungen
            </button>
          </div>
        </div>
      </div>

      {/* Comparison Highlights Banner */}
      {(showPrevYear || showPrevYear2) && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {showPrevYear && previousYearSummary && (
            <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 text-amber-900">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="font-bold">Vorjahr ({previousYearSummary.year}):</span>
              <span>Gesamt: <strong>{formatCurrencyFull(previousYearSummary.totalRevenue)}</strong></span>
              <span>
                YoY:{' '}
                <strong className={previousYearSummary.growthPercentRevenue >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  {previousYearSummary.growthPercentRevenue >= 0 ? '+' : ''}{previousYearSummary.growthPercentRevenue}%
                </strong>
              </span>
              <span className="text-amber-300">|</span>
              <span>{previousYearSummary.totalOrders} Bestellungen</span>
            </div>
          )}
          {showPrevYear2 && previousYear2Summary && (
            <div className="flex items-center gap-2 text-xs bg-violet-50 border border-violet-200 rounded-xl px-3 py-1.5 text-violet-900">
              <span className="w-2 h-2 rounded-full bg-violet-600" />
              <span className="font-bold">Vor-Vorjahr ({previousYear2Summary.year}):</span>
              <span>Gesamt: <strong>{formatCurrencyFull(previousYear2Summary.totalRevenue)}</strong></span>
              <span>
                YoY:{' '}
                <strong className={previousYear2Summary.growthPercentRevenue >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  {previousYear2Summary.growthPercentRevenue >= 0 ? '+' : ''}{previousYear2Summary.growthPercentRevenue}%
                </strong>
              </span>
              <span className="text-violet-300">|</span>
              <span>{previousYear2Summary.totalOrders} Bestellungen</span>
            </div>
          )}
        </div>
      )}

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
            <Tooltip content={<CustomTimelineTooltip showPrevYear={showPrevYear} showPrevYear2={showPrevYear2} />} />
            
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

            {/* Vorjahr (N-1) Comparison Lines */}
            {showPrevYear && (viewMetric === 'both' || viewMetric === 'revenue') && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="prevYearRevenue"
                name={`Vorjahr ${previousYearSummary ? previousYearSummary.year : ''} (Umsatz)`}
                stroke="#F59E0B"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            )}
            {showPrevYear && (viewMetric === 'both' || viewMetric === 'orders') && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="prevYearOrders"
                name={`Vorjahr ${previousYearSummary ? previousYearSummary.year : ''} (Bestellungen)`}
                stroke="#F97316"
                strokeWidth={2}
                strokeDasharray="3 3"
                dot={false}
              />
            )}

            {/* Vor-Vorjahr (N-2) Comparison Lines */}
            {showPrevYear2 && (viewMetric === 'both' || viewMetric === 'revenue') && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="prevYear2Revenue"
                name={`Vor-Vorjahr ${previousYear2Summary ? previousYear2Summary.year : ''} (Umsatz)`}
                stroke="#8B5CF6"
                strokeWidth={2}
                strokeDasharray="2 2"
                dot={false}
              />
            )}
            {showPrevYear2 && (viewMetric === 'both' || viewMetric === 'orders') && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="prevYear2Orders"
                name={`Vor-Vorjahr ${previousYear2Summary ? previousYear2Summary.year : ''} (Bestellungen)`}
                stroke="#A855F7"
                strokeWidth={2}
                strokeDasharray="2 2"
                dot={false}
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

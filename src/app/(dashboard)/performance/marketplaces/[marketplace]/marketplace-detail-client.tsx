'use client'

import React, { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Package,
  RotateCcw,
  XCircle,
  Search,
  Store,
  ChevronRight,
  RefreshCw,
  X,
  Calendar,
  ArrowRightLeft,
  BarChart3
} from 'lucide-react'
import type {
  PerformanceAnalyticsResponse,
  PerformanceFilterOptions,
  TimeRangePreset,
  ProductDrilldownData
} from '../../types'
import { getPerformanceAnalytics, getProductPerformanceDrilldown } from '@/app/actions/performance'
import {
  RevenueOrdersTimelineChart,
  MarketplacePeriodComparisonChart,
  TopProductsBarChart,
  ProductTimelineChart
} from '../../performance-charts'

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function MetricTrendBadge({ change, label }: { change: number; label?: string }) {
  const isPositive = change > 0
  const isZero = change === 0
  if (isZero) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
        0.0%{label ? ` ${label}` : ''}
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded ${
        isPositive ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
      }`}
    >
      {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {isPositive ? `+${change}%` : `${change}%`}
      {label ? <span className="ml-0.5 font-normal opacity-80">{label}</span> : null}
    </span>
  )
}

type ComparePresetMode = 'auto_prev' | 'prev_month' | 'prev_quarter' | 'prev_year' | 'custom_compare'

export function MarketplaceDetailClient({
  initialData,
  marketplaceId,
  initialCompareFrom,
  initialCompareTo,
}: {
  initialData: PerformanceAnalyticsResponse
  marketplaceId: string
  initialCompareFrom?: string
  initialCompareTo?: string
}) {
  const router = useRouter()
  const [data, setData] = useState<PerformanceAnalyticsResponse>(initialData)
  const [isPending, startTransition] = useTransition()

  // Time range states
  const [timeRange, setTimeRange] = useState<TimeRangePreset>(initialData.timeRange.preset)
  const [customFrom, setCustomFrom] = useState<string>(initialData.timeRange.from.split('T')[0])
  const [customTo, setCustomTo] = useState<string>(initialData.timeRange.to.split('T')[0])
  const [showCustomDates, setShowCustomDates] = useState(initialData.timeRange.preset === 'custom')

  // Earlier period comparison states
  const [compareMode, setCompareMode] = useState<ComparePresetMode>(
    initialCompareFrom ? 'custom_compare' : 'auto_prev'
  )
  const [compareFrom, setCompareFrom] = useState<string>(
    initialCompareFrom || initialData.timeRange.previousFrom.split('T')[0]
  )
  const [compareTo, setCompareTo] = useState<string>(
    initialCompareTo || initialData.timeRange.previousTo.split('T')[0]
  )

  // Products section states
  const [topProductsMetric, setTopProductsMetric] = useState<'revenue' | 'units'>('revenue')
  const [productSearch, setProductSearch] = useState('')
  const [productSortBy, setProductSortBy] = useState<'revenue' | 'units' | 'returns'>('revenue')
  const [productPage, setProductPage] = useState(1)
  const productsPerPage = 10

  // Product drilldown modal state
  const [drilldownSku, setDrilldownSku] = useState<string | null>(null)
  const [drilldownData, setDrilldownData] = useState<ProductDrilldownData | null>(null)
  const [drilldownLoading, setDrilldownLoading] = useState(false)

  const computeComparisonDates = (
    mode: ComparePresetMode,
    currentFromIso: string,
    currentToIso: string
  ): { cf?: string; ct?: string } => {
    if (mode === 'auto_prev') {
      return { cf: undefined, ct: undefined }
    }
    if (mode === 'custom_compare') {
      return { cf: compareFrom, ct: compareTo }
    }

    const fromObj = new Date(currentFromIso)
    const toObj = new Date(currentToIso)
    const durationMs = toObj.getTime() - fromObj.getTime()

    if (mode === 'prev_month') {
      const cfDate = new Date(fromObj.getFullYear(), fromObj.getMonth() - 1, fromObj.getDate())
      const ctDate = new Date(cfDate.getTime() + durationMs)
      return {
        cf: cfDate.toISOString().split('T')[0],
        ct: ctDate.toISOString().split('T')[0],
      }
    }

    if (mode === 'prev_quarter') {
      const cfDate = new Date(fromObj.getTime() - 90 * 86400000)
      const ctDate = new Date(cfDate.getTime() + durationMs)
      return {
        cf: cfDate.toISOString().split('T')[0],
        ct: ctDate.toISOString().split('T')[0],
      }
    }

    if (mode === 'prev_year') {
      const cfDate = new Date(fromObj.getFullYear() - 1, fromObj.getMonth(), fromObj.getDate())
      const ctDate = new Date(toObj.getFullYear() - 1, toObj.getMonth(), toObj.getDate())
      return {
        cf: cfDate.toISOString().split('T')[0],
        ct: ctDate.toISOString().split('T')[0],
      }
    }

    return { cf: undefined, ct: undefined }
  }

  const applyFilters = (
    nextRange?: TimeRangePreset,
    nextCompareMode?: ComparePresetMode,
    explicitCompareFrom?: string,
    explicitCompareTo?: string
  ) => {
    const activeRange = nextRange !== undefined ? nextRange : timeRange
    const activeCompareMode = nextCompareMode !== undefined ? nextCompareMode : compareMode

    let cf: string | undefined
    let ct: string | undefined

    if (explicitCompareFrom !== undefined) {
      cf = explicitCompareFrom
      ct = explicitCompareTo
    } else if (activeCompareMode === 'custom_compare') {
      cf = compareFrom
      ct = compareTo
    } else if (activeCompareMode !== 'auto_prev') {
      const computed = computeComparisonDates(
        activeCompareMode,
        activeRange === 'custom' ? customFrom : data.timeRange.from,
        activeRange === 'custom' ? customTo : data.timeRange.to
      )
      cf = computed.cf
      ct = computed.ct
    }

    const filters: PerformanceFilterOptions = {
      timeRange: activeRange,
      marketplace: marketplaceId,
      customFrom: activeRange === 'custom' ? customFrom : undefined,
      customTo: activeRange === 'custom' ? customTo : undefined,
      compareFrom: cf,
      compareTo: ct,
    }

    startTransition(async () => {
      try {
        const res = await getPerformanceAnalytics(filters)
        setData(res)
        setCompareFrom(res.timeRange.previousFrom.split('T')[0])
        setCompareTo(res.timeRange.previousTo.split('T')[0])
      } catch (err) {
        console.error('Failed to update marketplace performance data:', err)
      }
    })
  }

  const handleTimeRangeClick = (range: TimeRangePreset) => {
    setTimeRange(range)
    if (range === 'custom') {
      setShowCustomDates(true)
    } else {
      setShowCustomDates(false)
      applyFilters(range, compareMode)
    }
  }

  const handleCompareModeChange = (mode: ComparePresetMode) => {
    setCompareMode(mode)
    if (mode !== 'custom_compare') {
      applyFilters(timeRange, mode)
    }
  }

  const handleCustomDateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    applyFilters('custom', compareMode)
  }

  const handleCustomCompareSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    applyFilters(timeRange, 'custom_compare', compareFrom, compareTo)
  }

  const handleSwitchMarketplace = (newMp: string) => {
    if (newMp === 'all') {
      router.push(`/performance?tab=marketplaces&timeRange=${timeRange}`)
      return
    }
    const params = new URLSearchParams()
    params.set('timeRange', timeRange)
    if (timeRange === 'custom') {
      params.set('from', customFrom)
      params.set('to', customTo)
    }
    if (compareMode === 'custom_compare' && compareFrom && compareTo) {
      params.set('compareFrom', compareFrom)
      params.set('compareTo', compareTo)
    }
    router.push(`/performance/marketplaces/${encodeURIComponent(newMp)}?${params.toString()}`)
  }

  const openProductDrilldown = async (sku: string) => {
    setDrilldownSku(sku)
    setDrilldownLoading(true)
    try {
      const res = await getProductPerformanceDrilldown(sku, {
        timeRange,
        marketplace: marketplaceId,
        customFrom: timeRange === 'custom' ? customFrom : undefined,
        customTo: timeRange === 'custom' ? customTo : undefined,
      })
      setDrilldownData(res)
    } catch (err) {
      console.error('Failed to fetch product drilldown:', err)
    } finally {
      setDrilldownLoading(false)
    }
  }

  const closeProductDrilldown = () => {
    setDrilldownSku(null)
    setDrilldownData(null)
  }

  const filteredProducts = useMemo(() => {
    return data.products
      .filter((p) => {
        const q = productSearch.toLowerCase().trim()
        return (
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.mappingSkus && p.mappingSkus.toLowerCase().includes(q))
        )
      })
      .sort((a, b) => {
        if (productSortBy === 'revenue') return b.revenue - a.revenue
        if (productSortBy === 'units') return b.unitsSold - a.unitsSold
        if (productSortBy === 'returns') return b.returnCount - a.returnCount
        return 0
      })
  }, [data.products, productSearch, productSortBy])

  const totalProductPages = Math.ceil(filteredProducts.length / productsPerPage) || 1
  const displayedProducts = filteredProducts.slice(
    (productPage - 1) * productsPerPage,
    productPage * productsPerPage
  )

  const timePresets: { id: TimeRangePreset; label: string }[] = [
    { id: 'today', label: 'Heute' },
    { id: '7d', label: '7 Tage' },
    { id: '30d', label: '30 Tage' },
    { id: 'this_month', label: 'Dieser Monat' },
    { id: 'last_month', label: 'Letzter Monat' },
    { id: '90d', label: '90 Tage' },
    { id: 'this_year', label: 'Dieses Jahr' },
    { id: '365d', label: '365 Tage' },
    { id: 'custom', label: 'Benutzerdefiniert' },
  ]

  const ov = data.overview
  const marketplaceName = data.selectedMarketplaceName || marketplaceId
  const currentRangeLabel = `${formatDateShort(data.timeRange.from)} – ${formatDateShort(data.timeRange.to)}`
  const compareRangeLabel = `${formatDateShort(data.timeRange.previousFrom)} – ${formatDateShort(data.timeRange.previousTo)}`
  const daysCount = Math.max(1, data.timeline.length)

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16 animate-fadeIn">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <Link
            href={`/performance?tab=marketplaces&timeRange=${timeRange}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-cyan-600 transition-colors"
          >
            <ArrowLeft size={14} />
            Zurück zur Marktplatz-Übersicht
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-600 flex items-center justify-center shadow-sm">
              <Store size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {marketplaceName}
                </h2>
                <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                  {marketplaceId}
                </span>
                {isPending && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-full border border-cyan-200 animate-pulse">
                    <RefreshCw size={12} className="animate-spin" />
                    Aktualisiere...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Zeitraum: <strong className="text-slate-700">{currentRangeLabel}</strong> • Vergleich mit:{' '}
                <strong className="text-emerald-700">{compareRangeLabel}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Right Controls: Switch Marketplace & Refresh */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={marketplaceId}
              onChange={(e) => handleSwitchMarketplace(e.target.value)}
              className="text-slate-900 bg-white border border-slate-200 text-sm font-semibold rounded-xl px-3.5 py-2.5 pr-9 shadow-sm hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all cursor-pointer"
            >
              <option value="all">Alle Marktplätze (Übersicht)</option>
              {data.availableMarketplaces.map((mp) => (
                <option key={mp.id} value={mp.id}>
                  {mp.name} ({mp.id})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => applyFilters()}
            disabled={isPending}
            title="Daten neu laden"
            className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={isPending ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter & Earlier Period Comparison Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        {/* Row 1: Primary Time Range Presets */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 no-scrollbar">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2 flex items-center gap-1">
              <Calendar size={13} />
              Zeitraum:
            </span>
            {timePresets.map((preset) => {
              const isActive = timeRange === preset.id
              return (
                <button
                  key={preset.id}
                  onClick={() => handleTimeRangeClick(preset.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          {showCustomDates && (
            <form onSubmit={handleCustomDateSubmit} className="flex items-center gap-2 text-xs w-full md:w-auto justify-end">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-slate-900 placeholder:text-slate-500 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <span className="text-slate-400">bis</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-slate-900 placeholder:text-slate-500 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                type="submit"
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-all"
              >
                Anwenden
              </button>
            </form>
          )}
        </div>

        {/* Row 2: Compare Towards Earlier Periods Selector */}
        <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2 flex items-center gap-1">
              <ArrowRightLeft size={13} />
              Vergleichszeitraum:
            </span>
            {[
              { id: 'auto_prev', label: 'Direkte Vorperiode' },
              { id: 'prev_month', label: 'Vormonat (-30T)' },
              { id: 'prev_quarter', label: 'Vorquartal (-90T)' },
              { id: 'prev_year', label: 'Vorjahr (-1 Jahr)' },
              { id: 'custom_compare', label: 'Eigener Vergleichszeitraum' },
            ].map((item) => {
              const active = compareMode === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => handleCompareModeChange(item.id as ComparePresetMode)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                    active
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/70'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          {compareMode === 'custom_compare' ? (
            <form onSubmit={handleCustomCompareSubmit} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Vergleiche mit:</span>
              <input
                type="date"
                value={compareFrom}
                onChange={(e) => setCompareFrom(e.target.value)}
                className="text-slate-900 placeholder:text-slate-500 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-slate-400">bis</span>
              <input
                type="date"
                value={compareTo}
                onChange={(e) => setCompareTo(e.target.value)}
                className="text-slate-900 placeholder:text-slate-500 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-all"
              >
                Vergleichen
              </button>
            </form>
          ) : (
            <div className="text-xs text-slate-500">
              Aktiver Vergleich: <span className="font-semibold text-slate-800">{compareRangeLabel}</span>
            </div>
          )}
        </div>
      </div>

      {/* 4 Key Metric Cards with Earlier-Period & YoY Comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Umsatz ({marketplaceName})</span>
              <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
                €
              </div>
            </div>
            <p className="text-3xl font-extrabold text-slate-900 mt-3">
              {formatCurrency(ov.totalRevenue.value)}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">
                Vorperiode ({formatCurrency(ov.totalRevenue.previousValue)})
              </span>
              <MetricTrendBadge change={ov.totalRevenue.changePercent} />
            </div>
            {data.previousYearSummary && (
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Vorjahr {data.previousYearSummary.year}: {formatCurrency(data.previousYearSummary.totalRevenue)}</span>
                <span className={data.previousYearSummary.growthPercentRevenue >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                  {data.previousYearSummary.growthPercentRevenue >= 0 ? '+' : ''}{data.previousYearSummary.growthPercentRevenue}% YoY
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Orders */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bestellungen</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <ShoppingCart size={16} />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-slate-900 mt-3">{ov.totalOrders.value}</p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Vorperiode ({ov.totalOrders.previousValue})</span>
              <MetricTrendBadge change={ov.totalOrders.changePercent} />
            </div>
            {data.previousYearSummary && (
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Vorjahr {data.previousYearSummary.year}: {data.previousYearSummary.totalOrders}</span>
                <span className={data.previousYearSummary.growthPercentOrders >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                  {data.previousYearSummary.growthPercentOrders >= 0 ? '+' : ''}{data.previousYearSummary.growthPercentOrders}% YoY
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Average Order Value */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ø Warenkorb (AOV)</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <DollarSign size={16} />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-slate-900 mt-3">
              {formatCurrency(ov.averageOrderValue.value)}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">
                Vorperiode ({formatCurrency(ov.averageOrderValue.previousValue)})
              </span>
              <MetricTrendBadge change={ov.averageOrderValue.changePercent} />
            </div>
            {data.previousYearSummary && (
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Vorjahr {data.previousYearSummary.year}: {formatCurrency(data.previousYearSummary.averageOrderValue)}</span>
                <span className={data.previousYearSummary.growthPercentAOV >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                  {data.previousYearSummary.growthPercentAOV >= 0 ? '+' : ''}{data.previousYearSummary.growthPercentAOV}% YoY
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Units Sold */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Verkaufte Stück</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Package size={16} />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-slate-900 mt-3">{ov.totalUnitsSold.value}</p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Vorperiode ({ov.totalUnitsSold.previousValue} Stk.)</span>
              <MetricTrendBadge change={ov.totalUnitsSold.changePercent} />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Ø Umsatz / Tag:</span>
              <span className="font-semibold text-slate-700">
                {formatCurrency(ov.totalRevenue.value / daysCount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Interactive Timeline Comparison Chart */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <RevenueOrdersTimelineChart
          data={data.timeline}
          previousPeriodSummary={data.previousPeriodSummary}
          previousYearSummary={data.previousYearSummary}
          previousYear2Summary={data.previousYear2Summary}
          defaultShowPrevPeriod={true}
          title={`${marketplaceName} – Umsatz & Bestellverlauf im Zeitvergleich`}
          subtitle="Vergleiche die tägliche Entwicklung direkt mit der Vorperiode, dem Vorjahr (-1J) oder Vor-Vorjahr (-2J)"
        />
      </div>

      {/* Period Comparison Section: Side-by-Side Bar Chart + Detailed Period Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <MarketplacePeriodComparisonChart
            currentSummary={{
              label: currentRangeLabel,
              revenue: ov.totalRevenue.value,
              orders: ov.totalOrders.value,
              averageOrderValue: ov.averageOrderValue.value,
            }}
            previousPeriodSummary={data.previousPeriodSummary}
            previousYearSummary={data.previousYearSummary}
            previousYear2Summary={data.previousYear2Summary}
          />
        </div>

        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="text-base font-bold text-slate-900">Zeitraum-Vergleichsmatrix ({marketplaceName})</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detaillierte Kennzahlen-Gegenüberstellung gegenüber früheren Zeiträumen
                </p>
              </div>
              <BarChart3 size={18} className="text-cyan-600" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/75 text-xs text-slate-500 font-semibold border-b border-slate-200/60 uppercase">
                  <tr>
                    <th className="py-3 px-4">Periode</th>
                    <th className="py-3 px-4 text-right">Umsatz</th>
                    <th className="py-3 px-4 text-right">Veränderung</th>
                    <th className="py-3 px-4 text-right">Bestellungen</th>
                    <th className="py-3 px-4 text-right">Ø Warenkorb</th>
                    <th className="py-3 px-4 text-right">Ø / Tag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Current Period Row */}
                  <tr className="bg-cyan-50/30 font-semibold">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                        <div>
                          <p className="text-slate-900 font-bold">Aktueller Zeitraum</p>
                          <p className="text-[11px] text-slate-500 font-normal">{currentRangeLabel}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-extrabold text-slate-900">
                      {formatCurrency(ov.totalRevenue.value)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-xs text-slate-400">Referenz</td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900">{ov.totalOrders.value}</td>
                    <td className="py-3.5 px-4 text-right text-slate-800">
                      {formatCurrency(ov.averageOrderValue.value)}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-700">
                      {formatCurrency(ov.totalRevenue.value / daysCount)}
                    </td>
                  </tr>

                  {/* Previous / Comparison Period Row */}
                  {data.previousPeriodSummary && (
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          <div>
                            <p className="text-slate-900 font-semibold">Vorperiode / Vergleich</p>
                            <p className="text-[11px] text-slate-500">{data.previousPeriodSummary.label}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {formatCurrency(data.previousPeriodSummary.totalRevenue)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <MetricTrendBadge change={data.previousPeriodSummary.growthPercentRevenue} />
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-700">
                        {data.previousPeriodSummary.totalOrders}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-700">
                        {formatCurrency(data.previousPeriodSummary.averageOrderValue)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-600">
                        {formatCurrency(data.previousPeriodSummary.totalRevenue / daysCount)}
                      </td>
                    </tr>
                  )}

                  {/* Previous Year (N-1) Row */}
                  {data.previousYearSummary && (
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                          <div>
                            <p className="text-slate-900 font-semibold">Vorjahr ({data.previousYearSummary.year})</p>
                            <p className="text-[11px] text-slate-500">Gleicher Zeitraum -1 Jahr</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {formatCurrency(data.previousYearSummary.totalRevenue)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <MetricTrendBadge change={data.previousYearSummary.growthPercentRevenue} />
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-700">
                        {data.previousYearSummary.totalOrders}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-700">
                        {formatCurrency(data.previousYearSummary.averageOrderValue)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-600">
                        {formatCurrency(data.previousYearSummary.totalRevenue / daysCount)}
                      </td>
                    </tr>
                  )}

                  {/* Previous Year 2 (N-2) Row */}
                  {data.previousYear2Summary && (
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                          <div>
                            <p className="text-slate-900 font-semibold">Vor-Vorjahr ({data.previousYear2Summary.year})</p>
                            <p className="text-[11px] text-slate-500">Gleicher Zeitraum -2 Jahre</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {formatCurrency(data.previousYear2Summary.totalRevenue)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <MetricTrendBadge change={data.previousYear2Summary.growthPercentRevenue} />
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-700">
                        {data.previousYear2Summary.totalOrders}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-700">
                        {formatCurrency(data.previousYear2Summary.averageOrderValue)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-600">
                        {formatCurrency(data.previousYear2Summary.totalRevenue / daysCount)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 bg-slate-50/70 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>
              Differenz Aktuell vs. Vorperiode:{' '}
              <strong className={ov.totalRevenue.value - ov.totalRevenue.previousValue >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                {ov.totalRevenue.value - ov.totalRevenue.previousValue >= 0 ? '+' : ''}
                {formatCurrency(ov.totalRevenue.value - ov.totalRevenue.previousValue)}
              </strong>
            </span>
            <span>Zeitraum-Länge: {daysCount} {daysCount === 1 ? 'Tag' : 'Tage'}</span>
          </div>
        </div>
      </div>

      {/* Operational & Quality Breakdown for this Marketplace */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Steuer & Netto ({marketplaceName})</h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Netto-Umsatz:</span>
              <span className="font-bold text-slate-900">{formatCurrency(ov.netRevenue.value)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Netto Vorperiode:</span>
              <span className="font-semibold text-slate-600">{formatCurrency(ov.netRevenue.previousValue)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">MwSt. enthalten:</span>
              <span className="font-semibold text-slate-700">{formatCurrency(ov.totalTax)}</span>
            </div>
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-sm font-bold">
              <span className="text-slate-900">Brutto-Summe:</span>
              <span className="text-cyan-600">{formatCurrency(ov.totalRevenue.value)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Bestellstatus</h4>
          <div className="space-y-2.5 text-xs">
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-emerald-700">Versendet ({ov.shippedOrdersCount})</span>
                <span className="text-slate-500">
                  {ov.totalOrders.value > 0 ? Math.round((ov.shippedOrdersCount / ov.totalOrders.value) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{
                    width: `${ov.totalOrders.value > 0 ? (ov.shippedOrdersCount / ov.totalOrders.value) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-blue-700">In Bearbeitung / Rechnungen ({ov.invoicedOrdersCount})</span>
                <span className="text-slate-500">
                  {ov.totalOrders.value > 0 ? Math.round((ov.invoicedOrdersCount / ov.totalOrders.value) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{
                    width: `${ov.totalOrders.value > 0 ? (ov.invoicedOrdersCount / ov.totalOrders.value) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-yellow-700">Ausstehend ({ov.pendingOrdersCount})</span>
                <span className="text-slate-500">
                  {ov.totalOrders.value > 0 ? Math.round((ov.pendingOrdersCount / ov.totalOrders.value) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500 rounded-full"
                  style={{
                    width: `${ov.totalOrders.value > 0 ? (ov.pendingOrdersCount / ov.totalOrders.value) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Retouren & Stornos</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                <RotateCcw size={14} className="text-rose-500" />
                Retouren
              </div>
              <p className="text-2xl font-bold text-slate-900">{ov.returnedOrdersCount}</p>
              <p className="text-[11px] text-slate-500 mt-1">Quote: {ov.returnRate}%</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                <XCircle size={14} className="text-red-500" />
                Stornierungen
              </div>
              <p className="text-2xl font-bold text-slate-900">{ov.cancelledOrdersCount}</p>
              <p className="text-[11px] text-slate-500 mt-1">Quote: {ov.cancelledRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Top Products Sold on this Marketplace */}
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="text-base font-bold text-slate-900">Top Produkte auf {marketplaceName}</h4>
              <p className="text-xs text-slate-500">Meistverkaufte Artikel auf diesem Kanal im gewählten Zeitraum</p>
            </div>
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                onClick={() => setTopProductsMetric('revenue')}
                className={`px-3 py-1 rounded-md transition-all ${
                  topProductsMetric === 'revenue' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600'
                }`}
              >
                Nach Umsatz
              </button>
              <button
                onClick={() => setTopProductsMetric('units')}
                className={`px-3 py-1 rounded-md transition-all ${
                  topProductsMetric === 'units' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600'
                }`}
              >
                Nach verkauften Stück
              </button>
            </div>
          </div>
          <TopProductsBarChart
            products={data.products}
            metric={topProductsMetric}
            onSelectSku={(sku) => openProductDrilldown(sku)}
          />
        </div>

        {/* Searchable Product Table for this Marketplace */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Produkt auf diesem Marktplatz suchen..."
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value)
                  setProductPage(1)
                }}
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white transition-all"
              />
            </div>

            <select
              value={productSortBy}
              onChange={(e) => {
                setProductSortBy(e.target.value as 'revenue' | 'units' | 'returns')
                setProductPage(1)
              }}
              className="text-slate-900 bg-white border border-slate-200 text-xs font-semibold rounded-xl px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="revenue">Sortieren: Umsatz</option>
              <option value="units">Sortieren: Verkaufte Stück</option>
              <option value="returns">Sortieren: Retouren</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/75 text-xs text-slate-500 font-semibold border-b border-slate-200/60 uppercase">
                <tr>
                  <th className="py-3 px-4">Produkt & SKU</th>
                  <th className="py-3 px-4 text-right">Verkaufte Stück</th>
                  <th className="py-3 px-4 text-right">Umsatz</th>
                  <th className="py-3 px-4 text-right">Ø Preis</th>
                  <th className="py-3 px-4 text-right">Bestellungen</th>
                  <th className="py-3 px-4 text-right">Retouren</th>
                  <th className="py-3 px-4 text-center">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 text-sm">
                      Keine Produktverkäufe für {marketplaceName} im gewählten Zeitraum gefunden.
                    </td>
                  </tr>
                ) : (
                  displayedProducts.map((p) => (
                    <tr
                      key={p.sku}
                      className="hover:bg-slate-50/60 transition-colors group cursor-pointer"
                      onClick={() => openProductDrilldown(p.sku)}
                    >
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-900 line-clamp-1 group-hover:text-cyan-600 transition-colors">
                          {p.title}
                        </p>
                        <span className="text-xs text-slate-400 font-mono">SKU: {p.sku}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-800">{p.unitsSold}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {formatCurrency(p.revenue)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-700">
                        {formatCurrency(p.averagePrice)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-700">{p.orderCount}</td>
                      <td className="py-3.5 px-4 text-right">
                        {p.returnCount > 0 ? (
                          <span className="text-rose-600 font-semibold">
                            {p.returnCount} <span className="text-[11px] text-slate-400">({p.returnRate}%)</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openProductDrilldown(p.sku)}
                          className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                          title="Produkt-Detailverlauf öffnen"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalProductPages > 1 && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Zeige {(productPage - 1) * productsPerPage + 1} bis{' '}
                {Math.min(productPage * productsPerPage, filteredProducts.length)} von {filteredProducts.length} Produkten
              </span>
              <div className="flex gap-2">
                <button
                  disabled={productPage === 1}
                  onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Zurück
                </button>
                <button
                  disabled={productPage >= totalProductPages}
                  onClick={() => setProductPage((p) => Math.min(totalProductPages, p + 1))}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Weiter
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom Product Drilldown Modal */}
      {drilldownSku && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
          onClick={closeProductDrilldown}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold text-cyan-600 uppercase tracking-wider">
                  Produktdetail-Analyse ({marketplaceName})
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-1">
                  {drilldownData?.title || drilldownSku}
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">SKU: {drilldownSku}</p>
              </div>
              <button
                onClick={closeProductDrilldown}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {drilldownLoading ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 space-y-3">
                <RefreshCw size={28} className="animate-spin text-cyan-500" />
                <p className="text-sm font-medium">Lade Produktdaten...</p>
              </div>
            ) : drilldownData ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Umsatz</span>
                    <p className="text-lg font-bold text-slate-900 mt-1">
                      {formatCurrency(drilldownData.totalRevenue)}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Verkauft</span>
                    <p className="text-lg font-bold text-slate-900 mt-1">
                      {drilldownData.totalUnitsSold} Stk.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Ø Preis</span>
                    <p className="text-lg font-bold text-slate-900 mt-1">
                      {formatCurrency(drilldownData.averagePrice)}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Lagerbestand</span>
                    <p className="text-lg font-bold text-slate-900 mt-1">
                      {drilldownData.currentStock !== null ? `${drilldownData.currentStock} Stk.` : '-'}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Täglicher Umsatzverlauf ({marketplaceName})
                  </h4>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <ProductTimelineChart data={drilldownData.timeline} />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={closeProductDrilldown}
                    className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
                  >
                    Schließen
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

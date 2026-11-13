'use client'

import React, { useState, useTransition } from 'react'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Package,
  Layers,
  RotateCcw,
  XCircle,
  Filter,
  Search,
  ExternalLink,
  Calendar,
  Store,
  ChevronRight,
  Info,
  RefreshCw,
  X,
  Boxes,
  Percent
} from 'lucide-react'
import type {
  PerformanceAnalyticsResponse,
  PerformanceFilterOptions,
  TimeRangePreset,
  ProductPerformanceData,
  ProductDrilldownData
} from './types'
import { getPerformanceAnalytics, getProductPerformanceDrilldown } from '@/app/actions/performance'
import {
  RevenueOrdersTimelineChart,
  MarketplaceDonutChart,
  MarketplaceBarChart,
  TopProductsBarChart,
  ProductTimelineChart
} from './performance-charts'

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
}

function MetricTrendBadge({ change }: { change: number }) {
  const isPositive = change > 0
  const isZero = change === 0
  if (isZero) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
        0.0%
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
    </span>
  )
}

export function PerformanceClient({ initialData }: { initialData: PerformanceAnalyticsResponse }) {
  const [data, setData] = useState<PerformanceAnalyticsResponse>(initialData)
  const [isPending, startTransition] = useTransition()

  // Filter States
  const [activeTab, setActiveTab] = useState<'overview' | 'marketplaces' | 'products'>('overview')
  const [timeRange, setTimeRange] = useState<TimeRangePreset>(initialData.timeRange.preset)
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>(initialData.selectedMarketplace)
  const [customFrom, setCustomFrom] = useState<string>(initialData.timeRange.from.split('T')[0])
  const [customTo, setCustomTo] = useState<string>(initialData.timeRange.to.split('T')[0])
  const [showCustomDates, setShowCustomDates] = useState(initialData.timeRange.preset === 'custom')

  // Product tab filters
  const [productSearch, setProductSearch] = useState('')
  const [productStockFilter, setProductStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all')
  const [productSortBy, setProductSortBy] = useState<'revenue' | 'units' | 'returns'>('revenue')
  const [productPage, setProductPage] = useState(1)
  const productsPerPage = 12

  // Product Drilldown Modal State
  const [drilldownSku, setDrilldownSku] = useState<string | null>(null)
  const [drilldownData, setDrilldownData] = useState<ProductDrilldownData | null>(null)
  const [drilldownLoading, setDrilldownLoading] = useState(false)

  // Top products chart metric
  const [topProductsMetric, setTopProductsMetric] = useState<'revenue' | 'units'>('revenue')

  const applyFilters = (newRange?: TimeRangePreset, newMarketplace?: string) => {
    const range = newRange !== undefined ? newRange : timeRange
    const mp = newMarketplace !== undefined ? newMarketplace : selectedMarketplace

    const filters: PerformanceFilterOptions = {
      timeRange: range,
      marketplace: mp,
      customFrom: range === 'custom' ? customFrom : undefined,
      customTo: range === 'custom' ? customTo : undefined,
    }

    startTransition(async () => {
      try {
        const res = await getPerformanceAnalytics(filters)
        setData(res)
      } catch (err) {
        console.error('Failed to update performance data:', err)
      }
    })
  }

  const handleTimeRangeClick = (range: TimeRangePreset) => {
    setTimeRange(range)
    if (range === 'custom') {
      setShowCustomDates(true)
    } else {
      setShowCustomDates(false)
      applyFilters(range, selectedMarketplace)
    }
  }

  const handleMarketplaceChange = (mp: string) => {
    setSelectedMarketplace(mp)
    applyFilters(timeRange, mp)
  }

  const handleCustomDateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    applyFilters('custom', selectedMarketplace)
  }

  const openProductDrilldown = async (sku: string) => {
    setDrilldownSku(sku)
    setDrilldownLoading(true)
    try {
      const res = await getProductPerformanceDrilldown(sku, {
        timeRange,
        marketplace: selectedMarketplace,
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

  // Filtered products list
  const filteredProducts = data.products
    .filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(productSearch.toLowerCase())
      const matchesStock =
        productStockFilter === 'all' || p.stockStatus === productStockFilter
      return matchesSearch && matchesStock
    })
    .sort((a, b) => {
      if (productSortBy === 'revenue') return b.revenue - a.revenue
      if (productSortBy === 'units') return b.unitsSold - a.unitsSold
      if (productSortBy === 'returns') return b.returnCount - a.returnCount
      return 0
    })

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
    { id: 'custom', label: 'Benutzerdefiniert' },
  ]

  const ov = data.overview

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Performance Analyse</h2>
            {isPending && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-full border border-cyan-200 animate-pulse">
                <RefreshCw size={12} className="animate-spin" />
                Aktualisiere...
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Umfassende Auswertung für Umsatz, Bestellvolumen, Marktplätze und Produktverkäufe
          </p>
        </div>

        {/* Global Filter Bar: Marketplace Selector */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedMarketplace}
              onChange={(e) => handleMarketplaceChange(e.target.value)}
              className="text-slate-900 bg-white border border-slate-200 text-sm font-semibold rounded-xl px-3.5 py-2.5 pr-9 shadow-sm hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all cursor-pointer"
            >
              <option value="all">Alle Marktplätze</option>
              {data.availableMarketplaces.map((mp) => (
                <option key={mp.id} value={mp.id}>
                  {mp.name}
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

      {/* Date Range Presets & Custom Picker */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 no-scrollbar">
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

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 text-sm font-semibold space-x-8">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'overview'
              ? 'border-cyan-500 text-cyan-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <TrendingUp size={18} />
          Gesamtübersicht
        </button>
        <button
          onClick={() => setActiveTab('marketplaces')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'marketplaces'
              ? 'border-cyan-500 text-cyan-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Store size={18} />
          Marktplätze ({data.marketplaces.length})
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'products'
              ? 'border-cyan-500 text-cyan-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Package size={18} />
          Produkte ({data.products.length})
        </button>
      </div>

      {/* ─── TAB 1: OVERVIEW ─── */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Key Metric Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Total Revenue */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gesamtumsatz</span>
                  <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
                    €
                  </div>
                </div>
                <p className="text-3xl font-extrabold text-slate-900 mt-3">
                  {formatCurrency(ov.totalRevenue.value)}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">vs. Vorperiode</span>
                <MetricTrendBadge change={ov.totalRevenue.changePercent} />
              </div>
            </div>

            {/* Total Orders */}
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
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">vs. Vorperiode</span>
                <MetricTrendBadge change={ov.totalOrders.changePercent} />
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
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">vs. Vorperiode</span>
                <MetricTrendBadge change={ov.averageOrderValue.changePercent} />
              </div>
            </div>

            {/* Total Units Sold */}
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
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">vs. Vorperiode</span>
                <MetricTrendBadge change={ov.totalUnitsSold.changePercent} />
              </div>
            </div>
          </div>

          {/* Main Timeline Chart */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <RevenueOrdersTimelineChart data={data.timeline} />
          </div>

          {/* Secondary Stats: Operational & Quality Rates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Net Revenue & Taxes */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Steuer & Netto</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Netto-Umsatz:</span>
                  <span className="font-bold text-slate-900">{formatCurrency(ov.netRevenue.value)}</span>
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

            {/* Status Breakdown */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Bestellstatus</h4>
              <div className="space-y-2.5 text-xs">
                <div>
                  <div className="flex justify-between font-semibold mb-1">
                    <span className="text-emerald-700">Versendet ({ov.shippedOrdersCount})</span>
                    <span className="text-slate-500">
                      {ov.totalOrders.value > 0
                        ? Math.round((ov.shippedOrdersCount / ov.totalOrders.value) * 100)
                        : 0}
                      %
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
                      {ov.totalOrders.value > 0
                        ? Math.round((ov.invoicedOrdersCount / ov.totalOrders.value) * 100)
                        : 0}
                      %
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
                      {ov.totalOrders.value > 0
                        ? Math.round((ov.pendingOrdersCount / ov.totalOrders.value) * 100)
                        : 0}
                      %
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

            {/* Returns & Cancellations */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Qualitätsmetriken</h4>
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
              <p className="text-[11px] text-slate-400">
                Basierend auf erfassten Retourenprotokollen und Stornostatus.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: MARKETPLACES ─── */}
      {activeTab === 'marketplaces' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
              <MarketplaceDonutChart data={data.marketplaces} />
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
              <MarketplaceBarChart data={data.marketplaces} />
            </div>
          </div>

          {/* Marketplace Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.marketplaces.map((mp) => (
              <div
                key={mp.marketplace}
                className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-cyan-300 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-base font-bold text-slate-900">{mp.name}</h4>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{mp.marketplace}</p>
                    </div>
                    <span className="text-xs font-bold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-lg border border-cyan-100">
                      {mp.revenueShare}% Anteil
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-5">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 uppercase">Umsatz</span>
                      <p className="text-xl font-bold text-slate-900 mt-0.5">{formatCurrency(mp.revenue)}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 uppercase">Bestellungen</span>
                      <p className="text-xl font-bold text-slate-900 mt-0.5">
                        {mp.orderCount} <span className="text-xs font-normal text-slate-500">({mp.unitsSold} Stk.)</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Ø Warenkorb: <strong className="text-slate-800">{formatCurrency(mp.averageOrderValue)}</strong></span>
                  {mp.returnRate > 0 && (
                    <span className="text-rose-600 font-medium">Retouren: {mp.returnRate}%</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Marketplace Comparison Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h4 className="text-base font-bold text-slate-900">Marktplatz Performance-Matrix</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Detaillierte Gegenüberstellung aller Verkaufskanäle
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/75 text-xs text-slate-500 font-semibold border-b border-slate-200/60 uppercase">
                  <tr>
                    <th className="py-3 px-4">Marktplatz</th>
                    <th className="py-3 px-4 text-right">Umsatz</th>
                    <th className="py-3 px-4 text-right">Umsatzanteil</th>
                    <th className="py-3 px-4 text-right">Bestellungen</th>
                    <th className="py-3 px-4 text-right">Einheiten</th>
                    <th className="py-3 px-4 text-right">Ø Warenkorb</th>
                    <th className="py-3 px-4 text-right">Stornoquote</th>
                    <th className="py-3 px-4 text-right">Retourenquote</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.marketplaces.map((mp) => (
                    <tr key={mp.marketplace} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {mp.name}
                        <span className="text-xs text-slate-400 font-mono ml-2">({mp.marketplace})</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {formatCurrency(mp.revenue)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-cyan-600">
                        {mp.revenueShare}%
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-700">{mp.orderCount}</td>
                      <td className="py-3.5 px-4 text-right text-slate-700">{mp.unitsSold}</td>
                      <td className="py-3.5 px-4 text-right text-slate-700">
                        {formatCurrency(mp.averageOrderValue)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {mp.cancelRate > 0 ? (
                          <span className="text-red-600 font-semibold">{mp.cancelRate}%</span>
                        ) : (
                          <span className="text-slate-400">0%</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {mp.returnRate > 0 ? (
                          <span className="text-rose-600 font-semibold">{mp.returnRate}%</span>
                        ) : (
                          <span className="text-slate-400">0%</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: PRODUCTS ─── */}
      {activeTab === 'products' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Top Products Horizontal Chart */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-end mb-2">
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

          {/* Product Filter and Search Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Produkte nach Name oder SKU suchen..."
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value)
                  setProductPage(1)
                }}
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white transition-all"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <select
                value={productStockFilter}
                onChange={(e) => {
                  setProductStockFilter(e.target.value as any)
                  setProductPage(1)
                }}
                className="text-slate-900 bg-white border border-slate-200 text-xs font-semibold rounded-xl px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="all">Alle Lagerbestände</option>
                <option value="in_stock">Auf Lager</option>
                <option value="low_stock">Geringer Bestand (≤ 5)</option>
                <option value="out_of_stock">Ausverkauft (0)</option>
              </select>

              <select
                value={productSortBy}
                onChange={(e) => {
                  setProductSortBy(e.target.value as any)
                  setProductPage(1)
                }}
                className="text-slate-900 bg-white border border-slate-200 text-xs font-semibold rounded-xl px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="revenue">Sortieren: Umsatz</option>
                <option value="units">Sortieren: Verkaufte Stück</option>
                <option value="returns">Sortieren: Retouren</option>
              </select>
            </div>
          </div>

          {/* Products Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
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
                    <th className="py-3 px-4 text-center">Lagerbestand</th>
                    <th className="py-3 px-4 text-center">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 text-sm">
                        Keine Produkte für die aktuellen Filterkriterien gefunden.
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
                          <p className="text-xs text-slate-400 font-mono mt-0.5">SKU: {p.sku}</p>
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                          {p.unitsSold}
                        </td>
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
                        <td className="py-3.5 px-4 text-center">
                          {p.currentStock !== null ? (
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                p.stockStatus === 'in_stock'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : p.stockStatus === 'low_stock'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {p.currentStock} Stk.
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openProductDrilldown(p.sku)}
                            className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                            title="Detailanalyse öffnen"
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

            {/* Pagination */}
            {totalProductPages > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Zeige {(productPage - 1) * productsPerPage + 1} bis{' '}
                  {Math.min(productPage * productsPerPage, filteredProducts.length)} von{' '}
                  {filteredProducts.length} Produkten
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
      )}

      {/* ─── CUSTOM PRODUCT DRILLDOWN MODAL ─── */}
      {drilldownSku && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
          onClick={closeProductDrilldown}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold text-cyan-600 uppercase tracking-wider">
                  Produktdetail-Analyse
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
                {/* Metric Summary Cards */}
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

                {/* Daily Trend Chart */}
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Täglicher Umsatzverlauf
                  </h4>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <ProductTimelineChart data={drilldownData.timeline} />
                  </div>
                </div>

                {/* Sales by Marketplace Breakdown */}
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Verkäufe nach Marktplatz
                  </h4>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                    {drilldownData.marketplaces.length === 0 ? (
                      <p className="p-4 text-xs text-slate-400 text-center">Keine Marktplatz-Verkäufe</p>
                    ) : (
                      drilldownData.marketplaces.map((m) => (
                        <div key={m.marketplace} className="p-3 flex items-center justify-between text-xs bg-white">
                          <span className="font-semibold text-slate-800">{m.name}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-slate-500">{m.units} Stk.</span>
                            <span className="font-bold text-slate-900">{formatCurrency(m.revenue)}</span>
                          </div>
                        </div>
                      ))
                    )}
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

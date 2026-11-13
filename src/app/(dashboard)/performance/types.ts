export type TimeRangePreset = 
  | 'today'
  | '7d' 
  | '30d' 
  | 'this_month' 
  | 'last_month' 
  | '90d' 
  | 'this_year' 
  | '365d'
  | 'all_time'
  | 'custom'

export interface PerformanceFilterOptions {
  timeRange: TimeRangePreset
  customFrom?: string // ISO date or YYYY-MM-DD
  customTo?: string   // ISO date or YYYY-MM-DD
  marketplace?: string // 'all' or specific marketplace id
}

export interface MetricComparison {
  value: number
  previousValue: number
  changePercent: number // e.g. +12.5 or -5.2
}

export interface PerformanceOverviewMetrics {
  totalRevenue: MetricComparison
  netRevenue: MetricComparison
  totalOrders: MetricComparison
  averageOrderValue: MetricComparison
  totalUnitsSold: MetricComparison
  totalTax: number
  shippedOrdersCount: number
  pendingOrdersCount: number
  invoicedOrdersCount: number
  cancelledOrdersCount: number
  cancelledRate: number // %
  returnedOrdersCount: number
  returnRate: number // %
}

export interface TimelineDataPoint {
  date: string       // YYYY-MM-DD
  label: string      // e.g. "12. Nov"
  revenue: number    // in EUR
  orders: number
  units: number
  prevYearDate?: string
  prevYearRevenue?: number // in EUR 1 year ago
  prevYearOrders?: number  // orders 1 year ago
  prevYear2Date?: string
  prevYear2Revenue?: number // in EUR 2 years ago
  prevYear2Orders?: number  // orders 2 years ago
}

export interface MarketplacePerformanceData {
  marketplace: string
  name: string
  revenue: number
  revenueShare: number // % of total
  orderCount: number
  orderShare: number   // % of total
  unitsSold: number
  averageOrderValue: number
  cancelledCount: number
  cancelRate: number
  returnedCount: number
  returnRate: number
}

export interface ProductPerformanceData {
  sku: string
  title: string
  unitsSold: number
  revenue: number
  averagePrice: number
  orderCount: number
  returnCount: number
  returnRate: number
  currentStock: number | null
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock' | 'untracked'
  marketplaceSpread: number // how many marketplaces it sold on
}

export interface ProductDrilldownData {
  sku: string
  title: string
  currentStock: number | null
  totalUnitsSold: number
  totalRevenue: number
  averagePrice: number
  returnCount: number
  timeline: {
    date: string
    label: string
    revenue: number
    units: number
  }[]
  marketplaces: {
    marketplace: string
    name: string
    units: number
    revenue: number
  }[]
}

export interface PreviousYearSummary {
  year: number
  totalRevenue: number
  totalOrders: number
  growthPercentRevenue: number
  growthPercentOrders: number
}

export interface PerformanceAnalyticsResponse {
  timeRange: {
    preset: TimeRangePreset
    from: string
    to: string
    previousFrom: string
    previousTo: string
  }
  selectedMarketplace: string
  availableMarketplaces: { id: string; name: string }[]
  overview: PerformanceOverviewMetrics
  timeline: TimelineDataPoint[]
  marketplaces: MarketplacePerformanceData[]
  products: ProductPerformanceData[]
  previousYearSummary?: PreviousYearSummary
  previousYear2Summary?: PreviousYearSummary
}

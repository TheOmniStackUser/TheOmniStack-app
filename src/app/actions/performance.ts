'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { products } from '@/db/schema/products'
import { returnsLog, returnedItems } from '@/db/schema/returns'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and, ne, gte, lte, sql, inArray } from 'drizzle-orm'
import type { 
  PerformanceFilterOptions, 
  PerformanceAnalyticsResponse, 
  TimelineDataPoint,
  MarketplacePerformanceData,
  ProductPerformanceData,
  ProductDrilldownData,
  TimeRangePreset
} from '@/app/(dashboard)/performance/types'

const CURRENCY_CONVERSION: Record<string, number> = {
  EUR: 1.0,
  CHF: 1.03,
  USD: 0.92,
  GBP: 1.17,
  PLN: 0.23,
  SEK: 0.087,
  DKK: 0.13,
  NOK: 0.087,
  CZK: 0.04,
  HUF: 0.0025,
  RON: 0.20,
  BGN: 0.51,
  TRY: 0.029,
  AUD: 0.60,
  CAD: 0.68,
  JPY: 0.006,
}

function getEurRate(currency?: string | null): number {
  if (!currency) return 1.0
  return CURRENCY_CONVERSION[currency.toUpperCase()] ?? 1.0
}

function getMarketplaceName(id: string): string {
  if (!id) return 'Unbekannt'
  if (id === 'mirakl_decathlon' || id === 'mirakl_decathlon_eu') return 'Decathlon'
  if (id === 'mirakl_mediamarkt') return 'MediaMarkt'
  if (id === 'mirakl_custom') return 'Custom Mirakl'
  if (id === 'amazon') return 'Amazon'
  if (id === 'otto') return 'Otto'
  if (id === 'shopify') return 'Shopify'
  if (id === 'aboutyou') return 'About You'
  if (id === 'kaufland') return 'Kaufland'
  if (id === 'ebay') return 'eBay'
  if (id === 'etsy') return 'Etsy'
  if (id === 'woocommerce') return 'WooCommerce'
  if (id === 'shopware') return 'Shopware'
  if (id === 'manual') return 'Manuell'
  return id.charAt(0).toUpperCase() + id.slice(1)
}

function calculateDateRange(preset: TimeRangePreset, customFrom?: string, customTo?: string) {
  const now = new Date()
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  let fromDate: Date
  let toDate: Date = endOfToday

  if (preset === 'today') {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  } else if (preset === '7d') {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0)
  } else if (preset === '30d') {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0)
  } else if (preset === 'this_month') {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  } else if (preset === 'last_month') {
    fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
    toDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
  } else if (preset === '90d') {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89, 0, 0, 0, 0)
  } else if (preset === 'this_year') {
    fromDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
  } else if (preset === 'all_time') {
    fromDate = new Date(now.getFullYear() - 5, 0, 1, 0, 0, 0, 0)
  } else if (preset === 'custom' && customFrom) {
    fromDate = new Date(customFrom)
    fromDate.setHours(0, 0, 0, 0)
    if (customTo) {
      toDate = new Date(customTo)
      toDate.setHours(23, 59, 59, 999)
    }
  } else {
    // Default 30 days
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0)
  }

  const durationMs = toDate.getTime() - fromDate.getTime()
  const previousToDate = new Date(fromDate.getTime() - 1)
  const previousFromDate = new Date(previousToDate.getTime() - durationMs)

  return { fromDate, toDate, previousFromDate, previousToDate }
}

function calculatePercentChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0
  }
  return Number((((current - previous) / previous) * 100).toFixed(1))
}

export async function getPerformanceAnalytics(filters: PerformanceFilterOptions): Promise<PerformanceAnalyticsResponse> {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const { fromDate, toDate, previousFromDate, previousToDate } = calculateDateRange(
    filters.timeRange, 
    filters.customFrom, 
    filters.customTo
  )

  const selectedMarketplace = filters.marketplace && filters.marketplace !== 'all' ? filters.marketplace : 'all'

  // Fetch all active integrations to list available marketplaces
  const integrationsPromise = db
    .select({ type: marketplaceIntegrations.type, metadata: marketplaceIntegrations.metadata })
    .from(marketplaceIntegrations)
    .where(and(eq(marketplaceIntegrations.companyId, companyId), eq(marketplaceIntegrations.isActive, true)))

  // 1. Fetch current period orders
  const currentOrdersWhere = [
    eq(orders.companyId, companyId),
    eq(orders.isArchived, false),
    ne(orders.status, 'draft'),
    sql`coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) >= ${fromDate.toISOString()}`,
    sql`coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) <= ${toDate.toISOString()}`,
  ]
  if (selectedMarketplace !== 'all') {
    currentOrdersWhere.push(eq(orders.marketplace, selectedMarketplace))
  }

  const currentOrdersPromise = db
    .select({
      id: orders.id,
      marketplace: orders.marketplace,
      status: orders.status,
      totalAmount: orders.totalAmount,
      subtotalAmount: orders.subtotalAmount,
      taxAmount: orders.taxAmount,
      currency: orders.currency,
      date: sql<string>`coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt})`,
    })
    .from(orders)
    .where(and(...currentOrdersWhere))

  // 2. Fetch previous period orders for comparison
  const previousOrdersWhere = [
    eq(orders.companyId, companyId),
    eq(orders.isArchived, false),
    ne(orders.status, 'draft'),
    sql`coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) >= ${previousFromDate.toISOString()}`,
    sql`coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) <= ${previousToDate.toISOString()}`,
  ]
  if (selectedMarketplace !== 'all') {
    previousOrdersWhere.push(eq(orders.marketplace, selectedMarketplace))
  }

  const previousOrdersPromise = db
    .select({
      id: orders.id,
      totalAmount: orders.totalAmount,
      subtotalAmount: orders.subtotalAmount,
      currency: orders.currency,
      status: orders.status,
    })
    .from(orders)
    .where(and(...previousOrdersWhere))

  // 3. Fetch returns for current period
  const returnsPromise = db
    .select({
      id: returnsLog.id,
      orderId: returnsLog.orderId,
      marketplace: returnsLog.marketplace,
      status: returnsLog.status,
    })
    .from(returnsLog)
    .where(
      and(
        eq(returnsLog.companyId, companyId),
        gte(returnsLog.scannedAt, fromDate),
        lte(returnsLog.scannedAt, toDate)
      )
    )

  // 4. Fetch returned items by SKU for product return counts
  const returnedItemsPromise = db
    .select({
      skuOrProductName: returnedItems.skuOrProductName,
      quantity: returnedItems.quantity,
    })
    .from(returnedItems)
    .innerJoin(returnsLog, eq(returnedItems.returnLogId, returnsLog.id))
    .where(
      and(
        eq(returnsLog.companyId, companyId),
        gte(returnsLog.scannedAt, fromDate),
        lte(returnsLog.scannedAt, toDate)
      )
    )

  // 5. Fetch central products catalog for stock and titles
  const productsPromise = db
    .select({
      sku: products.sku,
      title: products.title,
      currentStock: products.currentStock,
    })
    .from(products)
    .where(eq(products.companyId, companyId))

  const [
    integrations,
    currentOrders,
    previousOrders,
    returnsList,
    returnedItemsList,
    productsList
  ] = await Promise.all([
    integrationsPromise,
    currentOrdersPromise,
    previousOrdersPromise,
    returnsPromise,
    returnedItemsPromise,
    productsPromise
  ])

  // Get order IDs from current period to fetch item details
  const currentOrderIds = currentOrders.filter(o => o.status !== 'cancelled').map(o => o.id)
  
  let currentOrderItems: {
    orderId: string
    sku: string | null
    title: string
    quantity: string
    unitPrice: string
  }[] = []

  if (currentOrderIds.length > 0) {
    // Fetch order items in batches if large
    const chunkSize = 2000
    for (let i = 0; i < currentOrderIds.length; i += chunkSize) {
      const chunk = currentOrderIds.slice(i, i + chunkSize)
      const itemsChunk = await db
        .select({
          orderId: orderItems.orderId,
          sku: orderItems.sku,
          title: orderItems.title,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, chunk))
      
      currentOrderItems.push(...itemsChunk)
    }
  }

  // Also fetch item count for previous period to calculate units change
  const previousNonCancelledOrderIds = previousOrders.filter(o => o.status !== 'cancelled').map(o => o.id)
  let previousUnitsSold = 0
  if (previousNonCancelledOrderIds.length > 0) {
    const prevItemsChunk = await db
      .select({
        totalQuantity: sql<number>`coalesce(sum(${orderItems.quantity}::numeric), 0)::float`
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, previousNonCancelledOrderIds))
    previousUnitsSold = prevItemsChunk[0]?.totalQuantity || 0
  }

  // --- Aggregate Current Period Overview ---
  let currentTotalRev = 0
  let currentNetRev = 0
  let currentTax = 0
  let currentOrdersCount = 0
  let currentShippedCount = 0
  let currentPendingCount = 0
  let currentInvoicedCount = 0
  let currentCancelledCount = 0

  for (const o of currentOrders) {
    const isCancelled = o.status === 'cancelled'
    const rate = getEurRate(o.currency)
    const total = (parseFloat(o.totalAmount || '0') || 0) * rate
    const subtotal = (parseFloat(o.subtotalAmount || '0') || 0) * rate
    const tax = (parseFloat(o.taxAmount || '0') || 0) * rate

    if (isCancelled) {
      currentCancelledCount++
    } else {
      currentOrdersCount++
      currentTotalRev += total
      currentNetRev += subtotal
      currentTax += tax

      if (o.status === 'shipped') currentShippedCount++
      else if (o.status === 'pending') currentPendingCount++
      else if (o.status === 'invoiced' || o.status === 'processing' || o.status === 'later_shipment') currentInvoicedCount++
    }
  }

  // Previous Period Overview
  let prevTotalRev = 0
  let prevNetRev = 0
  let prevOrdersCount = 0

  for (const o of previousOrders) {
    if (o.status !== 'cancelled') {
      const rate = getEurRate(o.currency)
      const total = (parseFloat(o.totalAmount || '0') || 0) * rate
      const subtotal = (parseFloat(o.subtotalAmount || '0') || 0) * rate
      prevOrdersCount++
      prevTotalRev += total
      prevNetRev += subtotal
    }
  }

  // Units sold calculation
  let currentUnitsSold = 0
  for (const item of currentOrderItems) {
    currentUnitsSold += parseFloat(item.quantity || '0') || 0
  }

  const currentAOV = currentOrdersCount > 0 ? currentTotalRev / currentOrdersCount : 0
  const prevAOV = prevOrdersCount > 0 ? prevTotalRev / prevOrdersCount : 0

  const totalAllOrders = currentOrdersCount + currentCancelledCount
  const cancelledRate = totalAllOrders > 0 ? Number(((currentCancelledCount / totalAllOrders) * 100).toFixed(1)) : 0
  const returnedCount = returnsList.length
  const returnRate = currentOrdersCount > 0 ? Number(((returnedCount / currentOrdersCount) * 100).toFixed(1)) : 0

  // --- Construct Timeline ---
  const dailyMap: Record<string, { revenue: number; orders: number; units: number }> = {}

  // Pre-populate days in range so that graph has continuous dates
  const cur = new Date(fromDate)
  while (cur <= toDate) {
    const key = cur.toISOString().split('T')[0]
    dailyMap[key] = { revenue: 0, orders: 0, units: 0 }
    cur.setDate(cur.getDate() + 1)
  }

  const orderDateMap = new Map<string, string>()
  for (const o of currentOrders) {
    if (o.status !== 'cancelled') {
      const dayKey = new Date(o.date).toISOString().split('T')[0]
      orderDateMap.set(o.id, dayKey)
      if (dailyMap[dayKey]) {
        dailyMap[dayKey].revenue += (parseFloat(o.totalAmount || '0') || 0) * getEurRate(o.currency)
        dailyMap[dayKey].orders += 1
      }
    }
  }

  for (const item of currentOrderItems) {
    const dayKey = orderDateMap.get(item.orderId)
    if (dayKey && dailyMap[dayKey]) {
      dailyMap[dayKey].units += parseFloat(item.quantity || '0') || 0
    }
  }

  const timeline: TimelineDataPoint[] = Object.keys(dailyMap)
    .sort()
    .map(key => {
      const parts = key.split('-')
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
      const label = d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
      return {
        date: key,
        label,
        revenue: Number(dailyMap[key].revenue.toFixed(2)),
        orders: dailyMap[key].orders,
        units: Math.round(dailyMap[key].units)
      }
    })

  // --- Aggregate Marketplace Performance ---
  const mpMap: Record<string, {
    revenue: number
    orderCount: number
    unitsSold: number
    cancelledCount: number
    returnedCount: number
  }> = {}

  const orderMarketplaceMap = new Map<string, string>()

  for (const o of currentOrders) {
    const mp = o.marketplace || 'manual'
    orderMarketplaceMap.set(o.id, mp)
    if (!mpMap[mp]) {
      mpMap[mp] = { revenue: 0, orderCount: 0, unitsSold: 0, cancelledCount: 0, returnedCount: 0 }
    }

    if (o.status === 'cancelled') {
      mpMap[mp].cancelledCount++
    } else {
      mpMap[mp].orderCount++
      mpMap[mp].revenue += (parseFloat(o.totalAmount || '0') || 0) * getEurRate(o.currency)
    }
  }

  for (const item of currentOrderItems) {
    const mp = orderMarketplaceMap.get(item.orderId)
    if (mp && mpMap[mp]) {
      mpMap[mp].unitsSold += parseFloat(item.quantity || '0') || 0
    }
  }

  for (const ret of returnsList) {
    const mp = ret.marketplace || 'manual'
    if (mpMap[mp]) {
      mpMap[mp].returnedCount++
    }
  }

  const marketplaces: MarketplacePerformanceData[] = Object.keys(mpMap).map(mp => {
    const data = mpMap[mp]
    const mpTotalOrders = data.orderCount + data.cancelledCount
    const cancelRate = mpTotalOrders > 0 ? Number(((data.cancelledCount / mpTotalOrders) * 100).toFixed(1)) : 0
    const mpReturnRate = data.orderCount > 0 ? Number(((data.returnedCount / data.orderCount) * 100).toFixed(1)) : 0
    const aov = data.orderCount > 0 ? Number((data.revenue / data.orderCount).toFixed(2)) : 0
    const revShare = currentTotalRev > 0 ? Number(((data.revenue / currentTotalRev) * 100).toFixed(1)) : 0
    const ordShare = currentOrdersCount > 0 ? Number(((data.orderCount / currentOrdersCount) * 100).toFixed(1)) : 0

    return {
      marketplace: mp,
      name: getMarketplaceName(mp),
      revenue: Number(data.revenue.toFixed(2)),
      revenueShare: revShare,
      orderCount: data.orderCount,
      orderShare: ordShare,
      unitsSold: Math.round(data.unitsSold),
      averageOrderValue: aov,
      cancelledCount: data.cancelledCount,
      cancelRate,
      returnedCount: data.returnedCount,
      returnRate: mpReturnRate,
    }
  }).sort((a, b) => b.revenue - a.revenue)

  // --- Aggregate Product Performance ---
  const productMap: Record<string, {
    title: string
    unitsSold: number
    revenue: number
    orderIds: Set<string>
    marketplaces: Set<string>
  }> = {}

  for (const item of currentOrderItems) {
    const sku = (item.sku || 'SKU-OHNE').trim()
    const qty = parseFloat(item.quantity || '0') || 0
    const price = parseFloat(item.unitPrice || '0') || 0
    const lineTotal = qty * price

    if (!productMap[sku]) {
      productMap[sku] = {
        title: item.title || sku,
        unitsSold: 0,
        revenue: 0,
        orderIds: new Set(),
        marketplaces: new Set()
      }
    }

    productMap[sku].unitsSold += qty
    productMap[sku].revenue += lineTotal
    productMap[sku].orderIds.add(item.orderId)
    const mp = orderMarketplaceMap.get(item.orderId)
    if (mp) productMap[sku].marketplaces.add(mp)
  }

  // Returns per SKU
  const returnCountBySku: Record<string, number> = {}
  for (const retItem of returnedItemsList) {
    const sku = retItem.skuOrProductName.trim()
    returnCountBySku[sku] = (returnCountBySku[sku] || 0) + (retItem.quantity || 1)
  }

  // Catalog products map for stock and catalog title
  const catalogProductsMap = new Map(productsList.map(p => [p.sku.trim(), p]))

  const productsData: ProductPerformanceData[] = Object.keys(productMap).map(sku => {
    const item = productMap[sku]
    const catalogProduct = catalogProductsMap.get(sku)
    const stock = catalogProduct?.currentStock ? parseInt(catalogProduct.currentStock, 10) : null
    
    let stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock' | 'untracked' = 'untracked'
    if (stock !== null) {
      if (stock <= 0) stockStatus = 'out_of_stock'
      else if (stock <= 5) stockStatus = 'low_stock'
      else stockStatus = 'in_stock'
    }

    const retCount = returnCountBySku[sku] || 0
    const retRate = item.unitsSold > 0 ? Number(((retCount / item.unitsSold) * 100).toFixed(1)) : 0
    const avgPrice = item.unitsSold > 0 ? Number((item.revenue / item.unitsSold).toFixed(2)) : 0

    return {
      sku,
      title: catalogProduct?.title || item.title,
      unitsSold: Math.round(item.unitsSold),
      revenue: Number(item.revenue.toFixed(2)),
      averagePrice: avgPrice,
      orderCount: item.orderIds.size,
      returnCount: retCount,
      returnRate: retRate,
      currentStock: stock,
      stockStatus,
      marketplaceSpread: item.marketplaces.size
    }
  }).sort((a, b) => b.revenue - a.revenue)

  // Construct available marketplaces list
  const knownMps = new Set<string>()
  marketplaces.forEach(m => knownMps.add(m.marketplace))
  integrations.forEach(i => {
    if (i.type !== 'hermes' && i.type !== 'dhl') knownMps.add(i.type)
  })

  const availableMarketplaces = Array.from(knownMps).map(id => ({
    id,
    name: getMarketplaceName(id)
  }))

  return {
    timeRange: {
      preset: filters.timeRange,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      previousFrom: previousFromDate.toISOString(),
      previousTo: previousToDate.toISOString()
    },
    selectedMarketplace,
    availableMarketplaces,
    overview: {
      totalRevenue: {
        value: Number(currentTotalRev.toFixed(2)),
        previousValue: Number(prevTotalRev.toFixed(2)),
        changePercent: calculatePercentChange(currentTotalRev, prevTotalRev)
      },
      netRevenue: {
        value: Number(currentNetRev.toFixed(2)),
        previousValue: Number(prevNetRev.toFixed(2)),
        changePercent: calculatePercentChange(currentNetRev, prevNetRev)
      },
      totalOrders: {
        value: currentOrdersCount,
        previousValue: prevOrdersCount,
        changePercent: calculatePercentChange(currentOrdersCount, prevOrdersCount)
      },
      averageOrderValue: {
        value: Number(currentAOV.toFixed(2)),
        previousValue: Number(prevAOV.toFixed(2)),
        changePercent: calculatePercentChange(currentAOV, prevAOV)
      },
      totalUnitsSold: {
        value: Math.round(currentUnitsSold),
        previousValue: Math.round(previousUnitsSold),
        changePercent: calculatePercentChange(currentUnitsSold, previousUnitsSold)
      },
      totalTax: Number(currentTax.toFixed(2)),
      shippedOrdersCount: currentShippedCount,
      pendingOrdersCount: currentPendingCount,
      invoicedOrdersCount: currentInvoicedCount,
      cancelledOrdersCount: currentCancelledCount,
      cancelledRate,
      returnedOrdersCount: returnedCount,
      returnRate
    },
    timeline,
    marketplaces,
    products: productsData
  }
}

export async function getProductPerformanceDrilldown(
  sku: string,
  filters: PerformanceFilterOptions
): Promise<ProductDrilldownData> {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const { fromDate, toDate } = calculateDateRange(filters.timeRange, filters.customFrom, filters.customTo)

  // 1. Fetch catalog details for SKU
  const [catalogProduct] = await db
    .select({
      title: products.title,
      currentStock: products.currentStock
    })
    .from(products)
    .where(and(eq(products.companyId, companyId), eq(products.sku, sku)))
    .limit(1)

  // 2. Fetch order items matching this SKU in range
  const items = await db
    .select({
      orderId: orderItems.orderId,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      title: orderItems.title,
      marketplace: orders.marketplace,
      currency: orders.currency,
      date: sql<string>`coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt})`
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.companyId, companyId),
        eq(orderItems.sku, sku),
        eq(orders.isArchived, false),
        ne(orders.status, 'draft'),
        ne(orders.status, 'cancelled'),
        sql`coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) >= ${fromDate.toISOString()}`,
        sql`coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) <= ${toDate.toISOString()}`
      )
    )

  // 3. Fetch returns for this SKU
  const returnStats = await db
    .select({
      totalReturned: sql<number>`coalesce(sum(${returnedItems.quantity}), 0)::int`
    })
    .from(returnedItems)
    .innerJoin(returnsLog, eq(returnedItems.returnLogId, returnsLog.id))
    .where(
      and(
        eq(returnsLog.companyId, companyId),
        eq(returnedItems.skuOrProductName, sku),
        gte(returnsLog.scannedAt, fromDate),
        lte(returnsLog.scannedAt, toDate)
      )
    )

  let totalUnits = 0
  let totalRev = 0
  let mainTitle = catalogProduct?.title || ''

  const dailyMap: Record<string, { revenue: number; units: number }> = {}
  const cur = new Date(fromDate)
  while (cur <= toDate) {
    const key = cur.toISOString().split('T')[0]
    dailyMap[key] = { revenue: 0, units: 0 }
    cur.setDate(cur.getDate() + 1)
  }

  const mpMap: Record<string, { units: number; revenue: number }> = {}

  for (const item of items) {
    if (!mainTitle && item.title) mainTitle = item.title
    const qty = parseFloat(item.quantity || '0') || 0
    const lineRev = qty * (parseFloat(item.unitPrice || '0') || 0) * getEurRate(item.currency)

    totalUnits += qty
    totalRev += lineRev

    const dayKey = new Date(item.date).toISOString().split('T')[0]
    if (dailyMap[dayKey]) {
      dailyMap[dayKey].revenue += lineRev
      dailyMap[dayKey].units += qty
    }

    const mp = item.marketplace || 'manual'
    if (!mpMap[mp]) mpMap[mp] = { units: 0, revenue: 0 }
    mpMap[mp].units += qty
    mpMap[mp].revenue += lineRev
  }

  const timeline = Object.keys(dailyMap)
    .sort()
    .map(key => {
      const parts = key.split('-')
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
      const label = d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
      return {
        date: key,
        label,
        revenue: Number(dailyMap[key].revenue.toFixed(2)),
        units: Math.round(dailyMap[key].units)
      }
    })

  const marketplaces = Object.keys(mpMap).map(mp => ({
    marketplace: mp,
    name: getMarketplaceName(mp),
    units: Math.round(mpMap[mp].units),
    revenue: Number(mpMap[mp].revenue.toFixed(2))
  })).sort((a, b) => b.revenue - a.revenue)

  return {
    sku,
    title: mainTitle || sku,
    currentStock: catalogProduct?.currentStock ? parseInt(catalogProduct.currentStock, 10) : null,
    totalUnitsSold: Math.round(totalUnits),
    totalRevenue: Number(totalRev.toFixed(2)),
    averagePrice: totalUnits > 0 ? Number((totalRev / totalUnits).toFixed(2)) : 0,
    returnCount: returnStats[0]?.totalReturned || 0,
    timeline,
    marketplaces
  }
}

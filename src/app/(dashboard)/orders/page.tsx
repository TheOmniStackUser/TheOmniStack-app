import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { invoices, invoiceLogs } from '@/db/schema/invoices'
import { returnsLog } from '@/db/schema/returns'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, desc, asc, and, ne, inArray, or, ilike, sql } from 'drizzle-orm'
import { OrdersTable } from './orders-table'
import { ManualImport } from './manual-import'
import type { HermesConfig } from '@/app/(dashboard)/integrations/hermes-form'
import type { DhlConfig } from '@/app/(dashboard)/integrations/dhl-form'
import Link from 'next/link'

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const auth = await requireAuth()
  const params = await searchParams

  // Parse URL parameters
  const page = parseInt(params.page as string || '1', 10)
  const pageSize = parseInt(params.pageSize as string || '25', 10)
  const search = (params.search as string) || ''
  const marketplace = (params.marketplace as string) || 'all'
  const status = (params.status as string) || 'all'
  const shippingStatus = (params.shippingStatus as string) || 'all'
  const country = (params.country as string) || 'all'
  const sortField = (params.sortField as string) || null
  const sortDirection = (params.sortDirection as string) || null
  const fromDateParam = (params.fromDate as string) || null
  const toDateParam = (params.toDate as string) || null

  // Base where clause
  const whereConditions = [
    eq(orders.companyId, auth.activeCompanyId),
    eq(orders.isArchived, false),
    ne(orders.status, 'draft')
  ]

  if (fromDateParam) {
    whereConditions.push(sql`${orders.marketplacePurchaseDate} >= ${new Date(fromDateParam).toISOString()}`)
  }

  if (toDateParam) {
    const end = new Date(toDateParam)
    end.setHours(23, 59, 59, 999)
    whereConditions.push(sql`${orders.marketplacePurchaseDate} <= ${end.toISOString()}`)
  }



  // Calculate refund statuses for the entire company
  // This is needed for the stats cards and filtering
  const allReturns = await db.select({
    orderId: returnsLog.orderId,
    status: returnsLog.status,
    metadata: returnsLog.metadata
  }).from(returnsLog)
    .where(and(
      eq(returnsLog.companyId, auth.activeCompanyId),
      eq(returnsLog.status, 'bearbeitet')
    ))

  const orderIdsWithReturns = Array.from(new Set(allReturns.map(r => r.orderId).filter(Boolean) as string[]))
  
  let fullyRefundedIds: string[] = []
  let partiallyRefundedIds: string[] = []

  if (orderIdsWithReturns.length > 0) {
    const returnItems = await db.select({
      orderId: orderItems.orderId,
      quantity: orderItems.quantity,
      sku: orderItems.sku
    }).from(orderItems)
      .where(inArray(orderItems.orderId, orderIdsWithReturns))
    
    const itemsByOrder = returnItems.reduce((acc, item) => {
      acc[item.orderId] = acc[item.orderId] || []
      acc[item.orderId].push(item)
      return acc
    }, {} as Record<string, typeof returnItems>)

    const returnsByOrder = allReturns.reduce((acc, ret) => {
      if (ret.orderId) {
        acc[ret.orderId] = acc[ret.orderId] || []
        acc[ret.orderId].push(ret)
      }
      return acc
    }, {} as Record<string, typeof allReturns>)

    for (const orderId of orderIdsWithReturns) {
      const orderItemsList = itemsByOrder[orderId] || []
      const orderReturnsList = returnsByOrder[orderId] || []

      let totalOrderedQty = 0
      let totalRefundedQty = 0

      for (const item of orderItemsList) {
        totalOrderedQty += Number(item.quantity || 1)
        
        const refundedCount = orderReturnsList.reduce((acc, ret) => {
          if (ret.status === 'bearbeitet' && (ret.metadata as any)?.refundedItems) {
            const matched = ((ret.metadata as any).refundedItems as any[]).find((r: any) => r.sku === item.sku)
            if (matched && matched.quantity) {
              return acc + Number(matched.quantity)
            }
          }
          return acc
        }, 0)
        
        totalRefundedQty += refundedCount
      }

      if (totalOrderedQty > 0 && totalRefundedQty >= totalOrderedQty) {
        fullyRefundedIds.push(orderId)
      } else if (totalRefundedQty > 0 && totalRefundedQty < totalOrderedQty) {
        partiallyRefundedIds.push(orderId)
      }
    }
  }

  if (search) {
    const searchLower = search.toLowerCase()
    const searchConditions: any[] = [
      ilike(orders.marketplaceOrderId, `%${search}%`),
      ilike(orders.buyerName, `%${search}%`),
      ilike(orders.trackingNumber, `%${search}%`),
      ilike(orders.deliveryNoteNumber, `%${search}%`),
      ilike(sql`${orders.rawPayload}->>'orderNumber'`, `%${search}%`),
      ilike(sql`${orders.rawPayload}->>'name'`, `%${search}%`)
    ]
    
    // Support searching for refunded states via text input
    if (searchLower.includes('erstattet')) {
      if (searchLower === 'teilerstattet' || searchLower.includes('teil')) {
        if (partiallyRefundedIds.length > 0) searchConditions.push(inArray(orders.id, partiallyRefundedIds))
      } else {
        if (fullyRefundedIds.length > 0) searchConditions.push(inArray(orders.id, fullyRefundedIds))
      }
    }

    whereConditions.push(or(...searchConditions)!)
  }

  if (status !== 'all') {
    if (status === 'refunded') {
      if (fullyRefundedIds.length > 0) {
        whereConditions.push(inArray(orders.id, fullyRefundedIds))
      } else {
        whereConditions.push(sql`1=0`)
      }
    } else if (status === 'partially_refunded') {
      if (partiallyRefundedIds.length > 0) {
        whereConditions.push(inArray(orders.id, partiallyRefundedIds))
      } else {
        whereConditions.push(sql`1=0`)
      }
    } else {
      whereConditions.push(eq(orders.status, status as any))
    }
  }
  if (shippingStatus !== 'all') {
    whereConditions.push(eq(orders.shippingStatus, shippingStatus as any))
  }
  if (country !== 'all') {
    // simplified country filtering for demo
    whereConditions.push(ilike(orders.shippingCountry, `${country}%`))
  }
  if (marketplace !== 'all') {
    if (marketplace === 'group_direct') {
      whereConditions.push(inArray(orders.marketplace, ['otto', 'aboutyou', 'shopify', 'kaufland', 'ebay', 'amazon', 'etsy']))
    } else if (marketplace === 'group_decathlon') {
      whereConditions.push(inArray(orders.marketplace, ['mirakl_decathlon', 'mirakl_decathlon_eu', 'mirakl_custom']))
    } else if (marketplace === 'manual') {
      whereConditions.push(eq(orders.marketplace, 'manual'))
    } else {
      whereConditions.push(eq(orders.marketplace, marketplace as any))
    }
  }

  // Calculate top-level stats
  const statsRows = await db.select({
    status: orders.status,
    count: sql<number>`count(*)`
  }).from(orders).where(and(...[
    eq(orders.companyId, auth.activeCompanyId),
    eq(orders.isArchived, false),
    ne(orders.status, 'draft')
  ])).groupBy(orders.status)

  const stats = {
    total: statsRows.reduce((sum, r) => sum + Number(r.count), 0),
    pending: statsRows.find(r => r.status === 'pending')?.count || 0,
    laterShipment: statsRows.find(r => r.status === 'later_shipment')?.count || 0,
    shipped: statsRows.find(r => r.status === 'shipped')?.count || 0,
    cancelled: statsRows.find(r => r.status === 'cancelled')?.count || 0,
  }

  // Total count for pagination
  const [totalCountRow] = await db.select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(and(...whereConditions))

  const totalOrdersCount = Number(totalCountRow.count)

  // Order By
  let orderBy = desc(orders.marketplacePurchaseDate)
  if (sortField && sortDirection) {
    const dir = sortDirection === 'asc' ? asc : desc
    switch (sortField) {
      case 'bestelldatum': orderBy = dir(orders.marketplacePurchaseDate); break;
      case 'marketplace': orderBy = dir(orders.marketplace); break;
      case 'status': orderBy = dir(orders.status); break;
      case 'kunde': orderBy = dir(orders.buyerName); break;
      case 'umsatz': orderBy = dir(orders.totalAmount); break;
      case 'versanddatum': orderBy = dir(orders.updatedAt); break;
    }
  }

  // Fetch paginated base orders, integrations, and unique countries in parallel
  const [baseOrders, hermesIntegration, integrations, uniqueCountriesRows] = await Promise.all([
    db.select().from(orders).where(
      and(...whereConditions)
    )
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize),
    db.query.marketplaceIntegrations.findFirst({
      where: and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.type, 'hermes')
      )
    }),
    db.query.marketplaceIntegrations.findMany({
      where: and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.isActive, true)
      )
    }),
    db.select({ marketplace: orders.marketplace, country: orders.shippingCountry })
      .from(orders)
      .where(eq(orders.companyId, auth.activeCompanyId))
      .groupBy(orders.marketplace, orders.shippingCountry)
  ])

  const allUniqueCountries = Array.from(new Set(uniqueCountriesRows.map(r => {
    const raw = (r.country || '').toUpperCase()
    const iso3to2: Record<string, string> = {
      DEU: 'DE', AUT: 'AT', CHE: 'CH', FRA: 'FR', NLD: 'NL',
      BEL: 'BE', POL: 'PL', CZE: 'CZ', SVK: 'SK', LUX: 'LU',
      ITA: 'IT', ESP: 'ES', GBR: 'GB', USA: 'US', CHN: 'CN',
    }
    return raw.length === 3 ? (iso3to2[raw] ?? raw.slice(0, 2)) : raw
  }))).filter(Boolean).sort()

  const allUniqueMarketplaceCountries = uniqueCountriesRows.map(r => ({
    marketplace: r.marketplace,
    country: r.country
  }))

  // Extract IDs for fetching relations ONLY FOR VISIBLE ORDERS
  const orderIds = baseOrders.map(o => o.id)
  const invoiceIds = baseOrders.map(o => o.invoiceId).filter((id): id is string => id !== null)

  // Fetch relations in parallel ONLY for visible orders
  const [items, allInvoices, allLogs, allReturnsLogs] = await Promise.all([
    orderIds.length > 0 ? db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : Promise.resolve([]),
    invoiceIds.length > 0 ? db.select().from(invoices).where(inArray(invoices.id, invoiceIds)) : Promise.resolve([]),
    invoiceIds.length > 0 ? db.select().from(invoiceLogs).where(inArray(invoiceLogs.invoiceId, invoiceIds)) : Promise.resolve([]),
    orderIds.length > 0 ? db.select().from(returnsLog).where(inArray(returnsLog.orderId, orderIds)) : Promise.resolve([])
  ])

  // Stitch them together in memory (O(N) operations, extremely fast)
  const itemsByOrderId = items.reduce((acc, item) => {
    acc[item.orderId] = acc[item.orderId] || []
    acc[item.orderId].push(item)
    return acc
  }, {} as Record<string, any[]>)

  const logsByInvoiceId = allLogs.reduce((acc, log) => {
    acc[log.invoiceId] = acc[log.invoiceId] || []
    acc[log.invoiceId].push(log)
    return acc
  }, {} as Record<string, any[]>)

  const returnsByOrderId = allReturnsLogs.reduce((acc, ret) => {
    if (ret.orderId) {
      acc[ret.orderId] = acc[ret.orderId] || []
      acc[ret.orderId].push(ret)
    }
    return acc
  }, {} as Record<string, any[]>)

  const invoiceById = allInvoices.reduce((acc, inv) => {
    acc[inv.id] = inv
    return acc
  }, {} as Record<string, any>)

  const allOrders = baseOrders.map(o => {
    const inv = o.invoiceId ? invoiceById[o.invoiceId] : null
    return {
      ...o,
      items: itemsByOrderId[o.id] || [],
      returns: returnsByOrderId[o.id] || [],
      invoice: inv ? { ...inv, logs: logsByInvoiceId[inv.id] || [] } : null
    }
  })

  const hermesConfig = hermesIntegration?.metadata as HermesConfig | null
  const defaultParcelClass = hermesConfig?.defaultParcelClass ?? 'XS'
  const customMiraklIntegrations = integrations.filter(i => i.type === 'mirakl_custom')
  
  const dhlIntegration = integrations.find(i => i.type === 'dhl')
  const dhlConfig = dhlIntegration?.metadata as DhlConfig | null

  const hasOttoIntegration = integrations.some(i => i.type === 'otto' && i.clientId)
  const hasDecathlonIntegration = integrations.some(i => i.type === 'mirakl_decathlon' && i.clientId)
  const hasAmazonIntegration = integrations.some(i => i.type === 'amazon' && i.refreshToken)
  const hasShopifyIntegration = integrations.some(i => i.type === 'shopify' && i.accessToken)
  const hasKauflandIntegration = integrations.some(i => i.type === 'kaufland' && i.clientId && i.clientSecret)
  const hasEbayIntegration = integrations.some(i => i.type === 'ebay' && i.refreshToken)
  const hasAboutYouIntegration = integrations.some(i => i.type === 'aboutyou' && i.apiKey)
  const hasEtsyIntegration = integrations.some(i => i.type === 'etsy' && i.accessToken)
 
  // Optimize payload size for Client Component
  const optimizedOrders = allOrders.map(order => {
    const raw = order.rawPayload as any
    let strippedPayload = null
    if (raw) {
      strippedPayload = {
        orderNumber: raw.orderNumber,
        name: raw.name,
        financial_status: raw.financial_status,
        manualBillingAddress: raw.manualBillingAddress,
        invoiceAddress: raw.invoiceAddress,
        customer: raw.customer ? { billing_address: raw.customer.billing_address } : undefined,
        billing_street: raw.billing_street,
        billing_zip_code: raw.billing_zip_code,
        billing_city: raw.billing_city,
        billing_country_code: raw.billing_country_code,
        positionItems: raw.positionItems, // Required for OttoRefundModal
      }
    }
    return {
      ...order,
      rawPayload: strippedPayload,
      labelUrl: order.labelUrl ? 'EXISTS' : null,
      returnLabelUrl: order.returnLabelUrl ? 'EXISTS' : null,
    }
  })

  return (
    <div className="max-w-[1600px] mx-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Bestellungen</h2>
        <p className="text-gray-500 mt-2">Alle importierten Bestellungen im Überblick.</p>
        
        <div className="mt-6 grid grid-cols-2 md:grid-cols-7 gap-4">
          <Link href="/orders" className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm hover:border-gray-300 hover:shadow-md transition-all">
            <span className="text-sm font-medium text-gray-500">Gesamt</span>
            <span className="text-2xl font-bold text-gray-900">{stats.total}</span>
          </Link>
          <Link href="/orders?status=pending" className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm hover:border-gray-300 hover:shadow-md transition-all">
            <span className="text-sm font-medium text-gray-500">Pending</span>
            <span className="text-2xl font-bold text-amber-600">{stats.pending}</span>
          </Link>
          <Link href="/orders?status=later_shipment" className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm hover:border-gray-300 hover:shadow-md transition-all">
            <span className="text-sm font-medium text-gray-500">Späterer Versand</span>
            <span className="text-2xl font-bold text-blue-600">{stats.laterShipment}</span>
          </Link>
          <Link href="/orders?status=shipped" className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm hover:border-gray-300 hover:shadow-md transition-all">
            <span className="text-sm font-medium text-gray-500">Versendet</span>
            <span className="text-2xl font-bold text-emerald-600">{stats.shipped}</span>
          </Link>
          <Link href="/orders?status=cancelled" className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm hover:border-gray-300 hover:shadow-md transition-all">
            <span className="text-sm font-medium text-gray-500">Storniert</span>
            <span className="text-2xl font-bold text-red-600">{stats.cancelled}</span>
          </Link>
          <Link href="/orders?status=refunded" className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm hover:border-gray-300 hover:shadow-md transition-all">
            <span className="text-sm font-medium text-gray-500">Erstattet</span>
            <span className="text-2xl font-bold text-red-600">{fullyRefundedIds.length}</span>
          </Link>
          <Link href="/orders?status=partially_refunded" className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm hover:border-gray-300 hover:shadow-md transition-all">
            <span className="text-sm font-medium text-gray-500">Teilerstattet</span>
            <span className="text-2xl font-bold text-red-600">{partiallyRefundedIds.length}</span>
          </Link>
        </div>
      </header>

      <ManualImport 
        customMiraklIntegrations={customMiraklIntegrations} 
        hasKauflandIntegration={hasKauflandIntegration}
        hasEbayIntegration={hasEbayIntegration}
        hasOttoIntegration={hasOttoIntegration}
        hasDecathlonIntegration={hasDecathlonIntegration}
        hasShopifyIntegration={hasShopifyIntegration}
        hasAboutYouIntegration={hasAboutYouIntegration}
        hasEtsyIntegration={hasEtsyIntegration}
      />

      <OrdersTable 
        orders={optimizedOrders as any} 
        totalOrdersCount={totalOrdersCount}
        currentPage={page}
        pageSize={pageSize}
        urlParams={{
          search, marketplace, status, shippingStatus, country, sortField, sortDirection
        }}
        hermesDefaultParcelClass={defaultParcelClass} 
        customMiraklIntegrations={customMiraklIntegrations}
        dhlConfig={dhlConfig}
        hasKauflandIntegration={hasKauflandIntegration}
        hasEbayIntegration={hasEbayIntegration}
        hasAboutYouIntegration={hasAboutYouIntegration}
        hasOttoIntegration={hasOttoIntegration}
        hasDecathlonIntegration={hasDecathlonIntegration}
        hasAmazonIntegration={hasAmazonIntegration}
        hasShopifyIntegration={hasShopifyIntegration}
        hasEtsyIntegration={hasEtsyIntegration}
        allUniqueCountries={allUniqueCountries}
        allUniqueMarketplaceCountries={allUniqueMarketplaceCountries}
      />
    </div>
  )
}

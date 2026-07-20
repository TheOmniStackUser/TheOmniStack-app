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

  if (search) {
    whereConditions.push(
      or(
        ilike(orders.marketplaceOrderId, `%${search}%`),
        ilike(orders.buyerName, `%${search}%`),
        ilike(orders.trackingNumber, `%${search}%`),
        ilike(orders.deliveryNoteNumber, `%${search}%`),
        ilike(sql`${orders.rawPayload}->>'orderNumber'`, `%${search}%`),
        ilike(sql`${orders.rawPayload}->>'name'`, `%${search}%`)
      )!
    )
  }

  if (status !== 'all') {
    whereConditions.push(eq(orders.status, status as any))
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
      whereConditions.push(inArray(orders.marketplace, ['otto', 'aboutyou', 'shopify', 'kaufland', 'ebay', 'amazon']))
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

  // Fetch paginated base orders and integrations in parallel
  const [baseOrders, hermesIntegration, integrations] = await Promise.all([
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
    })
  ])

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
  const hasEbayIntegration = integrations.some(i => i.type === 'ebay' && i.clientId && i.clientSecret)
  const hasAboutYouIntegration = integrations.some(i => i.type === 'aboutyou' && i.apiKey)
 
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
        
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm">
            <span className="text-sm font-medium text-gray-500">Gesamt</span>
            <span className="text-2xl font-bold text-gray-900">{stats.total}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm">
            <span className="text-sm font-medium text-gray-500">Pending</span>
            <span className="text-2xl font-bold text-amber-600">{stats.pending}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm">
            <span className="text-sm font-medium text-gray-500">Späterer Versand</span>
            <span className="text-2xl font-bold text-blue-600">{stats.laterShipment}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm">
            <span className="text-sm font-medium text-gray-500">Versendet</span>
            <span className="text-2xl font-bold text-emerald-600">{stats.shipped}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm">
            <span className="text-sm font-medium text-gray-500">Storniert</span>
            <span className="text-2xl font-bold text-red-600">{stats.cancelled}</span>
          </div>
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
      />
    </div>
  )
}

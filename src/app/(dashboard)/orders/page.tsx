import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { invoices, invoiceLogs } from '@/db/schema/invoices'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, desc, and, ne, inArray, getTableColumns, sql } from 'drizzle-orm'
import { OrdersTable } from './orders-table'
import { ManualImport } from './manual-import'
import type { HermesConfig } from '@/app/(dashboard)/integrations/hermes-form'
import type { DhlConfig } from '@/app/(dashboard)/integrations/dhl-form'

export default async function OrdersPage() {
  const auth = await requireAuth()

  // Extract columns without the massive rawPayload
  const { rawPayload, ...orderColumns } = getTableColumns(orders)

  // First fetch base orders and integrations in parallel
  const [baseOrders, hermesIntegration, integrations] = await Promise.all([
    db.select({
      ...orderColumns,
      rawPayload: sql`
        CASE 
          WHEN ${orders.rawPayload} IS NULL THEN NULL
          ELSE jsonb_build_object(
            'orderNumber', ${orders.rawPayload}->>'orderNumber',
            'financial_status', ${orders.rawPayload}->>'financial_status',
            'manualBillingAddress', ${orders.rawPayload}->'manualBillingAddress',
            'invoiceAddress', ${orders.rawPayload}->'invoiceAddress',
            'customer', CASE WHEN ${orders.rawPayload}->'customer' IS NOT NULL THEN jsonb_build_object('billing_address', ${orders.rawPayload}->'customer'->'billing_address') ELSE NULL END,
            'billing_street', ${orders.rawPayload}->>'billing_street',
            'billing_zip_code', ${orders.rawPayload}->>'billing_zip_code',
            'billing_city', ${orders.rawPayload}->>'billing_city',
            'billing_country_code', ${orders.rawPayload}->>'billing_country_code'
          )
        END
      `
    }).from(orders).where(
      and(
        eq(orders.companyId, auth.activeCompanyId),
        eq(orders.isArchived, false),
        ne(orders.status, 'draft')
      )
    ).orderBy(desc(orders.marketplacePurchaseDate)),
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

  // Extract IDs for fetching relations
  const orderIds = baseOrders.map(o => o.id)
  const invoiceIds = baseOrders.map(o => o.invoiceId).filter((id): id is string => id !== null)

  // Fetch relations in parallel
  const [items, allInvoices, allLogs] = await Promise.all([
    orderIds.length > 0 
      ? db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
      : Promise.resolve([]),
    invoiceIds.length > 0 
      ? db.select().from(invoices).where(inArray(invoices.id, invoiceIds))
      : Promise.resolve([]),
    invoiceIds.length > 0 
      ? db.select().from(invoiceLogs).where(inArray(invoiceLogs.invoiceId, invoiceIds))
      : Promise.resolve([])
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

  const invoiceById = allInvoices.reduce((acc, inv) => {
    acc[inv.id] = inv
    return acc
  }, {} as Record<string, any>)

  const allOrders = baseOrders.map(o => {
    const inv = o.invoiceId ? invoiceById[o.invoiceId] : null
    return {
      ...o,
      items: itemsByOrderId[o.id] || [],
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
  // rawPayload can be huge (MBs) for 600+ orders, causing slow Next.js serialization
  const optimizedOrders = allOrders.map(order => {
    const raw = order.rawPayload as any
    let strippedPayload = null
    if (raw) {
      strippedPayload = {
        orderNumber: raw.orderNumber,
        financial_status: raw.financial_status,
        manualBillingAddress: raw.manualBillingAddress,
        invoiceAddress: raw.invoiceAddress,
        customer: raw.customer ? { billing_address: raw.customer.billing_address } : undefined,
        billing_street: raw.billing_street,
        billing_zip_code: raw.billing_zip_code,
        billing_city: raw.billing_city,
        billing_country_code: raw.billing_country_code,
      }
    }
    return {
      ...order,
      rawPayload: strippedPayload
    }
  })

  return (
    <div className="max-w-[1600px] mx-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Bestellungen</h2>
        <p className="text-gray-500 mt-2">Alle importierten Bestellungen im Überblick.</p>
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
        orders={optimizedOrders} 
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

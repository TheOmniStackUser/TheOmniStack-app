import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { invoices, invoiceLogs } from '@/db/schema/invoices'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, desc, and, ne, getTableColumns, sql } from 'drizzle-orm'

export async function GET(request: Request) {
  const timings: Record<string, number> = {}
  
  try {
    const t0 = Date.now()
    const auth = await requireAuth()
    timings['auth'] = Date.now() - t0

    const t1 = Date.now()
    const { rawPayload, ...orderColumns } = getTableColumns(orders)
    timings['getTableColumns'] = Date.now() - t1

    const t2 = Date.now()
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
    timings['baseOrdersQuery'] = Date.now() - t2
    timings['baseOrdersCount'] = baseOrders.length

    const t3 = Date.now()
    const orderIds = baseOrders.map(o => o.id)
    const invoiceIds = baseOrders.map(o => o.invoiceId).filter((id): id is string => id !== null)
    timings['extractIds'] = Date.now() - t3

    const t4 = Date.now()
    const [items, allInvoices, allLogs] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.companyId, auth.activeCompanyId)),
      db.select().from(invoices).where(eq(invoices.companyId, auth.activeCompanyId)),
      db.select().from(invoiceLogs).where(eq(invoiceLogs.companyId, auth.activeCompanyId))
    ])
    timings['relationsQuery'] = Date.now() - t4

    const t5 = Date.now()
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
    timings['stitchRelations'] = Date.now() - t5

    const t6 = Date.now()
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
    timings['optimizePayload'] = Date.now() - t6

    const t7 = Date.now()
    const jsonString = JSON.stringify(optimizedOrders)
    timings['jsonStringify'] = Date.now() - t7
    timings['jsonSizeMB'] = jsonString.length / 1024 / 1024

    timings['totalTime'] = Date.now() - t0

    return NextResponse.json({
      success: true,
      timings,
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
      timings
    })
  }
}

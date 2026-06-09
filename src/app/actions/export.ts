'use server'

import { db } from '@/db/client'
import { invoices } from '@/db/schema/invoices'
import { orders } from '@/db/schema/orders'
import { eq, and, gte, lte, sql, inArray, ne } from 'drizzle-orm'
import { requireAuth } from '@/lib/session'

export async function exportInvoiceJournalAction(filters: {
  fromDate?: string
  toDate?: string
  marketplace?: string
  country?: string
}) {
  const auth = await requireAuth()
  const companyId = auth.activeCompanyId

  const conditions = [
    eq(invoices.companyId, companyId),
    ne(invoices.documentType, 'quote'),
    ne(invoices.status, 'draft')
  ]

  if (filters.fromDate) {
    conditions.push(gte(invoices.createdAt, new Date(filters.fromDate)))
  }
  if (filters.toDate) {
    const end = new Date(filters.toDate)
    end.setHours(23, 59, 59, 999)
    conditions.push(lte(invoices.createdAt, end))
  }
  if (filters.country && filters.country !== 'all') {
    conditions.push(eq(invoices.recipientCountry, filters.country))
  }

  // Fetch invoices with items
  const results = await db.query.invoices.findMany({
    where: and(...conditions),
    with: {
      items: true,
    },
    orderBy: invoices.createdAt,
  })

  // Fetch linked orders for these invoices
  const invoiceIds = results.map(r => r.id)
  const cancelsInvoiceIds = results.map(r => r.cancelsInvoiceId).filter(Boolean) as string[]
  const allTargetInvoiceIds = Array.from(new Set([...invoiceIds, ...cancelsInvoiceIds]))

  const linkedOrders = allTargetInvoiceIds.length > 0 
    ? await db.query.orders.findMany({
        where: and(
          eq(orders.companyId, companyId), 
          inArray(orders.invoiceId, allTargetInvoiceIds)
        )
      })
    : []

  const orderMap = new Map(linkedOrders.map(o => [o.invoiceId, o]))

  // Filter by marketplace if needed
  const filteredResults = results.filter(r => {
    if (!filters.marketplace || filters.marketplace === 'all') return true
    const targetId = r.cancelsInvoiceId || r.id
    const order = orderMap.get(targetId)
    if (!order) return false
    const orderMp = (order.marketplace || 'manual').toLowerCase()
    const targetMp = filters.marketplace.toLowerCase()
    
    if (targetMp === 'group_decathlon') {
      return orderMp === 'mirakl_decathlon' || orderMp === 'mirakl_decathlon_eu' || orderMp.startsWith('decathlon')
    } else if (targetMp === 'group_secret_sales') {
      return orderMp.startsWith('secret sales')
    }
    return orderMp === targetMp
  })

  const taxRates = [19, 23, 27, 20, 21, 22, 17, 0, 25]

  // Generate CSV Header matching the image
  const header = [
    'Art',
    'Dokumentennummer',
    'Datum',
    'Fällig',
    'Kundennummer',
    'Kunde',
    'Dokumentenland',
    'Steuersatz',
    'Dokumententitel',
    'Zusatzinfo',
    'Zahlungsfrist',
    'Umsatzart',
    ...taxRates.map(rate => `${rate}%`),
    ...taxRates.map(rate => `Netto ${rate}%`),
    'Nettobetrag',
    'Rohgewinn',
    'Rechnungsbetrag',
    'Währung'
  ].join(';')

  const rows = filteredResults.map(inv => {
    const targetId = inv.cancelsInvoiceId || inv.id
    const order = orderMap.get(targetId)
    const items = inv.items || []
    const rawPayload = (order?.rawPayload as any) || {}
    const manualMetadata = rawPayload.manualMetadata || {}
    const taxOption = manualMetadata.taxOption || ''
    
    // Aggregate by tax rate
    const taxByRate: Record<number, number> = {}
    const netByRate: Record<number, number> = {}
    taxRates.forEach(r => { taxByRate[r] = 0; netByRate[r] = 0; })

    items.forEach(item => {
      const rateNum = parseFloat(item.taxRate)
      const rate = Math.round(rateNum * 100)
      const net = parseFloat(item.lineTotal)
      const tax = net * rateNum
      
      if (taxRates.includes(rate)) {
        netByRate[rate] += net
        taxByRate[rate] += tax
      }
    })

    const formatDate = (d: Date | null) => d ? d.toLocaleDateString('de-DE') : ''
    const formatNum = (n: number | string) => {
      const num = typeof n === 'string' ? parseFloat(n) : n
      return num === 0 ? '' : num.toFixed(2).replace('.', ',')
    }

    const issuedAt = inv.issuedAt || inv.createdAt
    const dueAt = inv.dueAt || new Date(issuedAt.getTime() + (14 * 24 * 60 * 60 * 1000))
    const diffTime = dueAt.getTime() - issuedAt.getTime()
    const zahlungsfrist = Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)))

    const marketplaceName = order?.marketplace ? order.marketplace.toUpperCase() : 'MANUELL'
    const docTitle = order?.marketplaceOrderId ? `${marketplaceName} ${order.marketplaceOrderId}` : (inv.draftName || marketplaceName)
    
    let umsatzart = ''
    if (taxOption === 'innergemeinschaftlich') umsatzart = `${zahlungsfrist} IG`
    else if (taxOption) umsatzart = taxOption

    return [
      inv.isCreditNote ? 'CREDIT_NOTE' : 'INVOICE',
      inv.invoiceNumber,
      formatDate(issuedAt),
      formatDate(dueAt),
      order?.customerNumber || '',
      inv.recipientName,
      inv.recipientCountry,
      inv.taxRate ? `${Math.round(parseFloat(inv.taxRate) * 100)}%` : '',
      docTitle,
      '', // Zusatzinfo
      zahlungsfrist.toString(),
      umsatzart,
      ...taxRates.map(r => formatNum(taxByRate[r])),
      ...taxRates.map(r => formatNum(netByRate[r])),
      formatNum(inv.subtotalAmount),
      formatNum(inv.subtotalAmount), // Rohgewinn = Netto
      formatNum(inv.totalAmount),
      inv.currency
    ].join(';')
  })

  const csvContent = [header, ...rows].join('\n')
  return { csv: csvContent }
}

import { requireAuth, getCurrentUser } from '@/lib/session'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq, and, or, ne, sql, inArray, isNull, lt } from 'drizzle-orm'
import { orders } from '@/db/schema/orders'
import { invoices } from '@/db/schema/invoices'
import { SyncButton } from './sync-button'
import Link from 'next/link'

function getMarketplaceName(id: string) {
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
  if (id === 'woocommerce') return 'WooCommerce'
  if (id === 'shopware') return 'Shopware'
  if (id === 'manual') return 'Manuell'
  return id.charAt(0).toUpperCase() + id.slice(1)
}

export default async function DashboardPage() {
  // The layout already enforces auth, but we fetch it here for the payload data
  const auth = await requireAuth()
  const user = await getCurrentUser()

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, auth.activeCompanyId))
    .limit(1)

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  // Fetch KPI Data
  const [{ openOrdersCount }] = await db
    .select({
      openOrdersCount: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.companyId, auth.activeCompanyId),
        eq(orders.isArchived, false),
        inArray(orders.status, ['pending', 'processing', 'invoiced', 'later_shipment'])
      )
    )

  const [{ totalOrdersCount }] = await db
    .select({
      totalOrdersCount: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.companyId, auth.activeCompanyId),
        eq(orders.isArchived, false),
        ne(orders.status, 'draft')
      )
    )

  // Orders status breakdown
  const orderStats = await db
    .select({
      status: orders.status,
      count: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.companyId, auth.activeCompanyId),
        eq(orders.isArchived, false)
      )
    )
    .groupBy(orders.status)

  const pendingCount = orderStats.find(s => s.status === 'pending' || s.status === 'invoiced')?.count || 0
  const laterShipmentCount = orderStats.find(s => s.status === 'later_shipment')?.count || 0
  const shippedCount = orderStats.find(s => s.status === 'shipped')?.count || 0
  const cancelledCount = orderStats.find(s => s.status === 'cancelled')?.count || 0

  // Marketplace stats
  const marketplaceStats = await db
    .select({
      marketplace: orders.marketplace,
      dayCount: sql<number>`count(case when coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) >= ${startOfDay.toISOString()} then 1 end)::int`,
      monthCount: sql<number>`count(case when coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) >= ${startOfMonth.toISOString()} then 1 end)::int`,
      yearCount: sql<number>`count(case when coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) >= ${startOfYear.toISOString()} then 1 end)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.companyId, auth.activeCompanyId),
        eq(orders.isArchived, false),
        sql`coalesce(${orders.marketplacePurchaseDate}, ${orders.createdAt}) >= ${startOfYear.toISOString()}`
      )
    )
    .groupBy(orders.marketplace)
    .orderBy(sql`count(*) desc`)

  const [invoicesStats] = await db
    .select({
      monthCount: sql<number>`count(case when coalesce(${invoices.issuedAt}, ${invoices.createdAt}) >= ${startOfMonth.toISOString()} then 1 end)::int`,
      monthRevenue: sql<number>`COALESCE(sum(case when coalesce(${invoices.issuedAt}, ${invoices.createdAt}) >= ${startOfMonth.toISOString()} then (case when ${invoices.isCreditNote} and ${invoices.subtotalAmount}::numeric > 0 then -${invoices.subtotalAmount}::numeric else ${invoices.subtotalAmount}::numeric end) * (case ${invoices.currency} when 'CHF' then 1.03 when 'USD' then 0.92 when 'GBP' then 1.17 when 'PLN' then 0.23 when 'SEK' then 0.087 when 'DKK' then 0.13 when 'NOK' then 0.087 when 'CZK' then 0.04 when 'HUF' then 0.0025 when 'RON' then 0.20 when 'BGN' then 0.51 when 'TRY' then 0.029 when 'AUD' then 0.60 when 'CAD' then 0.68 when 'JPY' then 0.006 else 1.0 end) end), 0)::float`,
      monthTax: sql<number>`COALESCE(sum(case when coalesce(${invoices.issuedAt}, ${invoices.createdAt}) >= ${startOfMonth.toISOString()} then (case when ${invoices.isCreditNote} and ${invoices.taxAmount}::numeric > 0 then -${invoices.taxAmount}::numeric else ${invoices.taxAmount}::numeric end) * (case ${invoices.currency} when 'CHF' then 1.03 when 'USD' then 0.92 when 'GBP' then 1.17 when 'PLN' then 0.23 when 'SEK' then 0.087 when 'DKK' then 0.13 when 'NOK' then 0.087 when 'CZK' then 0.04 when 'HUF' then 0.0025 when 'RON' then 0.20 when 'BGN' then 0.51 when 'TRY' then 0.029 when 'AUD' then 0.60 when 'CAD' then 0.68 when 'JPY' then 0.006 else 1.0 end) end), 0)::float`,
      totalCount: sql<number>`count(*)::int`,
      totalRevenue: sql<number>`COALESCE(sum((case when ${invoices.isCreditNote} and ${invoices.subtotalAmount}::numeric > 0 then -${invoices.subtotalAmount}::numeric else ${invoices.subtotalAmount}::numeric end) * (case ${invoices.currency} when 'CHF' then 1.03 when 'USD' then 0.92 when 'GBP' then 1.17 when 'PLN' then 0.23 when 'SEK' then 0.087 when 'DKK' then 0.13 when 'NOK' then 0.087 when 'CZK' then 0.04 when 'HUF' then 0.0025 when 'RON' then 0.20 when 'BGN' then 0.51 when 'TRY' then 0.029 when 'AUD' then 0.60 when 'CAD' then 0.68 when 'JPY' then 0.006 else 1.0 end)), 0)::float`,
      totalTax: sql<number>`COALESCE(sum((case when ${invoices.isCreditNote} and ${invoices.taxAmount}::numeric > 0 then -${invoices.taxAmount}::numeric else ${invoices.taxAmount}::numeric end) * (case ${invoices.currency} when 'CHF' then 1.03 when 'USD' then 0.92 when 'GBP' then 1.17 when 'PLN' then 0.23 when 'SEK' then 0.087 when 'DKK' then 0.13 when 'NOK' then 0.087 when 'CZK' then 0.04 when 'HUF' then 0.0025 when 'RON' then 0.20 when 'BGN' then 0.51 when 'TRY' then 0.029 when 'AUD' then 0.60 when 'CAD' then 0.68 when 'JPY' then 0.006 else 1.0 end)), 0)::float`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, auth.activeCompanyId),
        eq(invoices.documentType, 'invoice'),
        ne(invoices.status, 'draft')
      )
    )

  const [openInvoicesStats] = await db
    .select({
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`COALESCE(sum(${invoices.totalAmount}::numeric * (case ${invoices.currency} when 'CHF' then 1.03 when 'USD' then 0.92 when 'GBP' then 1.17 when 'PLN' then 0.23 when 'SEK' then 0.087 when 'DKK' then 0.13 when 'NOK' then 0.087 when 'CZK' then 0.04 when 'HUF' then 0.0025 when 'RON' then 0.20 when 'BGN' then 0.51 when 'TRY' then 0.029 when 'AUD' then 0.60 when 'CAD' then 0.68 when 'JPY' then 0.006 else 1.0 end)), 0)::float`,
    })
    .from(invoices)
    .leftJoin(orders, eq(invoices.id, orders.invoiceId))
    .where(
      and(
        eq(invoices.companyId, auth.activeCompanyId),
        eq(invoices.documentType, 'invoice'),
        eq(invoices.status, 'issued'),
        eq(invoices.isCreditNote, false),
        isNull(invoices.paidAt),
        or(
          isNull(orders.marketplace),
          eq(orders.marketplace, 'manual')
        )
      )
    )

  const [overdueInvoicesStats] = await db
    .select({
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`COALESCE(sum(${invoices.totalAmount}::numeric * (case ${invoices.currency} when 'CHF' then 1.03 when 'USD' then 0.92 when 'GBP' then 1.17 when 'PLN' then 0.23 when 'SEK' then 0.087 when 'DKK' then 0.13 when 'NOK' then 0.087 when 'CZK' then 0.04 when 'HUF' then 0.0025 when 'RON' then 0.20 when 'BGN' then 0.51 when 'TRY' then 0.029 when 'AUD' then 0.60 when 'CAD' then 0.68 when 'JPY' then 0.006 else 1.0 end)), 0)::float`,
    })
    .from(invoices)
    .leftJoin(orders, eq(invoices.id, orders.invoiceId))
    .where(
      and(
        eq(invoices.companyId, auth.activeCompanyId),
        eq(invoices.documentType, 'invoice'),
        eq(invoices.status, 'issued'),
        eq(invoices.isCreditNote, false),
        isNull(invoices.paidAt),
        lt(invoices.dueAt, now),
        or(
          isNull(orders.marketplace),
          eq(orders.marketplace, 'manual')
        )
      )
    )

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)

  const formattedMonthRevenue = formatCurrency(invoicesStats?.monthRevenue || 0)
  const formattedMonthTax = formatCurrency(invoicesStats?.monthTax || 0)
  const formattedTotalRevenue = formatCurrency(invoicesStats?.totalRevenue || 0)
  const formattedTotalTax = formatCurrency(invoicesStats?.totalTax || 0)
  const formattedOpenRevenue = formatCurrency(openInvoicesStats?.revenue || 0)
  const formattedOverdueRevenue = formatCurrency(overdueInvoicesStats?.revenue || 0)

  return (
    <div className="max-w-6xl mx-auto space-y-12">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Hallo, {user?.name}!</h2>
          <p className="text-gray-500 mt-2">
            Aktiver Mandant:{' '}
            <span className="font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-md ml-1">
              {company?.name}
            </span>
          </p>
        </div>
        <div className="flex gap-3">
          <SyncButton />
        </div>
      </header>

      {/* Orders Breakdown */}
      <section className="space-y-6">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">
          Bestellungen Übersicht
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Link href="/orders" className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm hover:border-gray-300 hover:shadow-md transition-all">
            <span className="text-sm font-medium text-gray-500">Gesamt</span>
            <span className="text-2xl font-bold text-gray-900 mt-1">{totalOrdersCount}</span>
          </Link>
          <Link href="/orders" className="bg-white border border-yellow-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm hover:border-yellow-300 hover:shadow-md transition-all">
            <span className="text-sm font-medium text-yellow-700">Pending</span>
            <span className="text-2xl font-bold text-yellow-600 mt-1">{pendingCount}</span>
          </Link>
          <Link href="/orders" className="bg-white border border-purple-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm hover:border-purple-300 hover:shadow-md transition-all">
            <span className="text-sm font-medium text-purple-700">Späterer Versand</span>
            <span className="text-2xl font-bold text-purple-600 mt-1">{laterShipmentCount}</span>
          </Link>
          <Link href="/orders" className="bg-white border border-green-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm hover:border-green-300 hover:shadow-md transition-all">
            <span className="text-sm font-medium text-green-700">Versendet</span>
            <span className="text-2xl font-bold text-green-600 mt-1">{shippedCount}</span>
          </Link>
          <Link href="/orders" className="bg-white border border-red-200 rounded-xl p-4 flex flex-col justify-center items-center shadow-sm hover:border-red-300 hover:shadow-md transition-all">
            <span className="text-sm font-medium text-red-700">Storniert</span>
            <span className="text-2xl font-bold text-red-600 mt-1">{cancelledCount}</span>
          </Link>
        </div>
      </section>

      {/* Current Month & Active Section */}
      <section className="space-y-6">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">
          Aktueller Monat & Finanzen
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link href="/orders" className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all group flex flex-col justify-between hidden">
            <div>
              <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider group-hover:text-blue-600 transition-colors">Offene Bestellungen</h3>
              <p className="text-4xl font-bold text-gray-900 mt-3">{openOrdersCount}</p>
            </div>
            <div className="mt-4 text-xs text-green-600 font-medium flex items-center gap-1">
              Marktplätze synchronisiert
              <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </div>
          </Link>
          
          <Link href="/invoices" className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all group flex flex-col justify-between">
            <div>
              <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider group-hover:text-blue-600 transition-colors">Rechnungen (Monat)</h3>
              <p className="text-4xl font-bold text-gray-900 mt-3">{invoicesStats?.monthCount || 0}</p>
            </div>
            <div className="mt-4 text-xs text-gray-500 font-medium flex items-center gap-1">
              {invoicesStats?.monthCount ? `${invoicesStats.monthCount} Rechnungen erzeugt` : 'Noch keine Rechnungen'}
              <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </div>
          </Link>
          
          {auth.role !== 'staff' && (
            <>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-300 transition-colors flex flex-col justify-between">
                <div>
                  <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider">Umsatz (Monat)</h3>
                  <p className="text-3xl font-bold text-gray-900 mt-3 break-words">{formattedMonthRevenue}</p>
                </div>
                <div className="mt-4 text-xs text-gray-500 font-medium">{formattedMonthTax} Steuern</div>
              </div>

              <Link href="/invoices?status=open" className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all group relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500" />
                <div>
                  <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider group-hover:text-blue-600 transition-colors">Offene Rechnungen</h3>
                  <p className="text-4xl font-bold text-gray-900 mt-3">{openInvoicesStats?.count || 0}</p>
                </div>
                <div className="mt-4 text-xs text-blue-600 font-bold flex items-center gap-1">
                  Summe: {formattedOpenRevenue}
                  <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </div>
              </Link>

              <Link href="/invoices?status=overdue" className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-red-500 hover:shadow-md transition-all group relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500" />
                <div>
                  <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider group-hover:text-red-600 transition-colors">Überfällige Rechnungen</h3>
                  <p className="text-4xl font-bold text-gray-900 mt-3 text-red-600">{overdueInvoicesStats?.count || 0}</p>
                </div>
                <div className="mt-4 text-xs text-red-600 font-bold flex items-center gap-1">
                  Summe: {formattedOverdueRevenue}
                  <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </div>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Lifetime / Overall Section */}
      <section className="space-y-6">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">
          Gesamtübersicht (Lebenszeit)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/orders" className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all group">
            <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider group-hover:text-blue-600 transition-colors">Bestellungen (Gesamt)</h3>
            <p className="text-4xl font-bold text-gray-900 mt-3">{totalOrdersCount}</p>
            <div className="mt-4 text-sm text-gray-500 font-medium flex items-center gap-1">
              Inkl. versendeter Bestellungen
              <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </div>
          </Link>
          
          <Link href="/invoices" className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all group">
            <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider group-hover:text-blue-600 transition-colors">Rechnungen (Gesamt)</h3>
            <p className="text-4xl font-bold text-gray-900 mt-3">{invoicesStats?.totalCount || 0}</p>
            <div className="mt-4 text-sm text-gray-500 font-medium flex items-center gap-1">
              Alle ausgestellten Rechnungen
              <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </div>
          </Link>
          
          {auth.role !== 'staff' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-300 transition-colors">
              <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider">Umsatz (Gesamt)</h3>
              <p className="text-4xl font-bold text-gray-900 mt-3">{formattedTotalRevenue}</p>
              <div className="mt-4 text-sm text-gray-500 font-medium">{formattedTotalTax} Steuern</div>
            </div>
          )}
        </div>
      </section>

      {/* Bestellungen pro Marktplatz */}
      {marketplaceStats.length > 0 && (
        <section className="space-y-6">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">
            Bestellungen pro Marktplatz
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {marketplaceStats.map((stat) => (
              <div key={stat.marketplace || 'unknown'} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:border-gray-300 hover:shadow-md transition-all flex flex-col justify-between">
                <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4 border-b border-gray-50 pb-2">
                  {getMarketplaceName(stat.marketplace)}
                </h4>
                <div className="flex justify-between items-end">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Heute</span>
                    <span className="text-xl font-bold text-gray-900">{stat.dayCount}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Monat</span>
                    <span className="text-xl font-bold text-gray-900">{stat.monthCount}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Jahr</span>
                    <span className="text-xl font-bold text-gray-900">{stat.yearCount}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}


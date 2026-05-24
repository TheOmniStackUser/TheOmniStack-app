import { requireAuth, getCurrentUser } from '@/lib/session'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq, and, ne, sql, inArray } from 'drizzle-orm'
import { orders } from '@/db/schema/orders'
import { invoices } from '@/db/schema/invoices'
import { SyncButton } from './sync-button'
import Link from 'next/link'

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
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

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

  const [invoicesStats] = await db
    .select({
      monthCount: sql<number>`count(case when coalesce(${invoices.issuedAt}, ${invoices.createdAt}) >= ${startOfMonth} then 1 end)::int`,
      monthRevenue: sql<number>`COALESCE(sum(case when coalesce(${invoices.issuedAt}, ${invoices.createdAt}) >= ${startOfMonth} then (case when ${invoices.isCreditNote} then -${invoices.totalAmount}::numeric else ${invoices.totalAmount}::numeric end) end), 0)::float`,
      monthTax: sql<number>`COALESCE(sum(case when coalesce(${invoices.issuedAt}, ${invoices.createdAt}) >= ${startOfMonth} then (case when ${invoices.isCreditNote} then -${invoices.taxAmount}::numeric else ${invoices.taxAmount}::numeric end) end), 0)::float`,
      totalCount: sql<number>`count(*)::int`,
      totalRevenue: sql<number>`COALESCE(sum(case when ${invoices.isCreditNote} then -${invoices.totalAmount}::numeric else ${invoices.totalAmount}::numeric end), 0)::float`,
      totalTax: sql<number>`COALESCE(sum(case when ${invoices.isCreditNote} then -${invoices.taxAmount}::numeric else ${invoices.taxAmount}::numeric end), 0)::float`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, auth.activeCompanyId),
        eq(invoices.documentType, 'invoice'),
        ne(invoices.status, 'draft')
      )
    )

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)

  const formattedMonthRevenue = formatCurrency(invoicesStats?.monthRevenue || 0)
  const formattedMonthTax = formatCurrency(invoicesStats?.monthTax || 0)
  const formattedTotalRevenue = formatCurrency(invoicesStats?.totalRevenue || 0)
  const formattedTotalTax = formatCurrency(invoicesStats?.totalTax || 0)

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

      {/* Current Month & Active Section */}
      <section className="space-y-6">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">
          Aktueller Monat & Offene Posten
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/orders" className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all group">
            <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider group-hover:text-blue-600 transition-colors">Offene Bestellungen</h3>
            <p className="text-4xl font-bold text-gray-900 mt-3">{openOrdersCount}</p>
            <div className="mt-4 text-sm text-green-600 font-medium flex items-center gap-1">
              Alle Marktplätze synchronisiert
              <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </div>
          </Link>
          
          <Link href="/invoices" className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all group">
            <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider group-hover:text-blue-600 transition-colors">Rechnungen (Monat)</h3>
            <p className="text-4xl font-bold text-gray-900 mt-3">{invoicesStats?.monthCount || 0}</p>
            <div className="mt-4 text-sm text-gray-500 font-medium flex items-center gap-1">
              {invoicesStats?.monthCount ? `${invoicesStats.monthCount} Rechnungen erzeugt` : 'Noch keine Rechnungen erstellt'}
              <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </div>
          </Link>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-300 transition-colors">
            <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider">Umsatz (Monat)</h3>
            <p className="text-4xl font-bold text-gray-900 mt-3">{formattedMonthRevenue}</p>
            <div className="mt-4 text-sm text-gray-500 font-medium">{formattedMonthTax} Steuern</div>
          </div>
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
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-300 transition-colors">
            <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider">Umsatz (Gesamt)</h3>
            <p className="text-4xl font-bold text-gray-900 mt-3">{formattedTotalRevenue}</p>
            <div className="mt-4 text-sm text-gray-500 font-medium">{formattedTotalTax} Steuern</div>
          </div>
        </div>
      </section>
    </div>
  )
}


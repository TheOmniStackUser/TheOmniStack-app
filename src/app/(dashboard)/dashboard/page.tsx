import { requireAuth, getCurrentUser } from '@/lib/session'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq, sql } from 'drizzle-orm'
import { orders } from '@/db/schema/orders'
import { SyncButton } from './sync-button'

export default async function DashboardPage() {
  // The layout already enforces auth, but we fetch it here for the payload data
  const auth = await requireAuth()
  const user = await getCurrentUser()

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, auth.activeCompanyId))
    .limit(1)

  // Fetch KPI Data
  const [{ orderCount, totalRevenue, totalTax }] = await db
    .select({
      orderCount: sql<number>`count(*)::int`,
      totalRevenue: sql<number>`COALESCE(sum(${orders.totalAmount}), 0)`,
      totalTax: sql<number>`COALESCE(sum(${orders.taxAmount}), 0)`,
    })
    .from(orders)
    .where(eq(orders.companyId, auth.activeCompanyId))

  const formattedRevenue = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalRevenue)
  const formattedTax = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalTax)

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8 flex items-start justify-between">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-300 transition-colors">
          <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider">Offene Bestellungen</h3>
          <p className="text-4xl font-bold text-gray-900 mt-3">{orderCount}</p>
          <div className="mt-4 text-sm text-green-600 font-medium">Alle Marktplätze synchronisiert</div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-300 transition-colors">
          <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider">Rechnungen (Monat)</h3>
          <p className="text-4xl font-bold text-gray-900 mt-3">0</p>
          <div className="mt-4 text-sm text-gray-500 font-medium">Noch keine Rechnungen erstellt</div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-300 transition-colors">
          <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider">Umsatz (Monat)</h3>
          <p className="text-4xl font-bold text-gray-900 mt-3">{formattedRevenue}</p>
          <div className="mt-4 text-sm text-gray-500 font-medium">{formattedTax} Steuern</div>
        </div>
      </div>
    </div>
  )
}

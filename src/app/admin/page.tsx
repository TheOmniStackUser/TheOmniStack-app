import { requireSuperAdmin } from '@/lib/admin-session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { companies } from '@/db/schema/companies'
import { users } from '@/db/schema/auth'
import { companyMembers } from '@/db/schema/companies'
import { sql, count, gte, and } from 'drizzle-orm'

export default async function AdminDashboardPage() {
  await requireSuperAdmin()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [totalCompanies] = await db.select({ count: count() }).from(companies)
  const [totalUsers] = await db.select({ count: count() }).from(users)
  const [totalOrders] = await db.select({ count: count() }).from(orders)
  const [ordersThisMonth] = await db
    .select({ count: count() })
    .from(orders)
    .where(gte(orders.createdAt, startOfMonth))

  // Orders per company this month
  const topMerchants = await db
    .select({
      companyId: orders.companyId,
      companyName: companies.name,
      orderCount: count(orders.id),
    })
    .from(orders)
    .leftJoin(companies, sql`${orders.companyId} = ${companies.id}`)
    .where(gte(orders.createdAt, startOfMonth))
    .groupBy(orders.companyId, companies.name)
    .orderBy(sql`count(${orders.id}) desc`)
    .limit(5)

  const monthName = now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-white/40 mt-1">Plattform-Übersicht für TheOmniStack</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Händler gesamt"
          value={totalCompanies.count.toString()}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
            </svg>
          }
          color="violet"
        />
        <StatCard
          label="Nutzer gesamt"
          value={totalUsers.count.toString()}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          color="blue"
        />
        <StatCard
          label={`Bestellungen ${monthName}`}
          value={ordersThisMonth.count.toString()}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          }
          color="emerald"
        />
        <StatCard
          label="Bestellungen gesamt"
          value={totalOrders.count.toString()}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
          color="amber"
        />
      </div>

      {/* Top Merchants This Month */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h2 className="text-base font-semibold text-white mb-4">Top Händler – {monthName}</h2>
        {topMerchants.length === 0 ? (
          <p className="text-white/30 text-sm">Keine Daten für diesen Monat.</p>
        ) : (
          <div className="space-y-3">
            {topMerchants.map((m, i) => (
              <div key={m.companyId} className="flex items-center gap-4">
                <span className="text-white/30 text-xs w-5">{i + 1}.</span>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-white font-medium">{m.companyName || 'Unbekannt'}</span>
                    <span className="text-sm font-bold text-violet-400">{m.orderCount} Bestellungen</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                      style={{ width: `${Math.min(100, (Number(m.orderCount) / Number(topMerchants[0]?.orderCount || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: string
  icon: React.ReactNode
  color: 'violet' | 'blue' | 'emerald' | 'amber'
}) {
  const colors = {
    violet: 'from-violet-500/20 to-violet-500/5 border-violet-500/20 text-violet-400',
    blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/20 text-blue-400',
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20 text-emerald-400',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/20 text-amber-400',
  }
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-5`}>
      <div className={`mb-3 ${colors[color].split(' ').find(c => c.startsWith('text-'))}`}>{icon}</div>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      <p className="text-xs text-white/40">{label}</p>
    </div>
  )
}

import { requireSuperAdmin } from '@/lib/admin-session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { companies, companyMembers } from '@/db/schema/companies'
import { users } from '@/db/schema/auth'
import { sql, count, gte, and, eq, lte } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { TrialManager } from './trial-manager'
import { FeatureManager } from './feature-manager'

export default async function AdminMerchantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSuperAdmin()
  const { id } = await params

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1)

  if (!company) notFound()

  // Last 6 months of order counts
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      label: d.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }),
      start: new Date(d.getFullYear(), d.getMonth(), 1),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
    }
  }).reverse()

  const monthlyData = await Promise.all(
    months.map(async (m) => {
      const [result] = await db
        .select({ count: count(orders.id) })
        .from(orders)
        .where(
          and(
            eq(orders.companyId, id),
            gte(orders.createdAt, m.start),
            lte(orders.createdAt, m.end)
          )
        )
      return { label: m.label, count: Number(result?.count ?? 0) }
    })
  )

  // Company members
  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: companyMembers.role,
      joinedAt: companyMembers.joinedAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(companyMembers)
    .leftJoin(users, eq(companyMembers.userId, users.id))
    .where(eq(companyMembers.companyId, id))


  const [totalOrdersRow] = await db.select({ count: count() }).from(orders).where(eq(orders.companyId, id))
  const maxCount = Math.max(...monthlyData.map(m => m.count), 1)
  const currentMonthCount = monthlyData[monthlyData.length - 1]?.count ?? 0

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <a href="/admin/merchants" className="text-xs text-white/30 hover:text-white/60 transition-colors mb-4 block">← Alle Händler</a>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{company.name}</h1>
            <p className="text-white/40 mt-1">{company.email || '–'} · Seit {new Date(company.createdAt).toLocaleDateString('de-DE')}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-violet-400">{currentMonthCount}</p>
            <p className="text-xs text-white/30 mt-1">Bestellungen diesen Monat</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Bar Chart */}
        <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-white mb-6">Bestellungen letzte 6 Monate</h2>
          <div className="flex items-end gap-3 h-32">
            {monthlyData.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-semibold text-white/60">{m.count}</span>
                <div className="w-full rounded-md overflow-hidden bg-white/5" style={{ height: '80px' }}>
                  <div
                    className="w-full bg-gradient-to-t from-violet-600 to-violet-400 rounded-md transition-all"
                    style={{ height: `${Math.max(4, (m.count / maxCount) * 80)}px`, marginTop: `${80 - Math.max(4, (m.count / maxCount) * 80)}px` }}
                  />
                </div>
                <span className="text-xs text-white/30">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-xs text-white/30 mb-1">Bestellungen gesamt</p>
            <p className="text-2xl font-bold text-white">{totalOrdersRow.count}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-xs text-white/30 mb-1">Nutzer im Account</p>
            <p className="text-2xl font-bold text-white">{members.length}</p>
          </div>
          <TrialManager companyId={company.id} currentExpiry={company.trialExpiresAt} />
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-xs text-white/30 mb-1">Land</p>
            <p className="text-2xl font-bold text-white">{company.country}</p>
          </div>
          <FeatureManager 
            companyId={company.id} 
            features={{ 
              returns: company.featuresReturnsEnabled, 
              products: company.featuresProductsEnabled 
            }} 
          />
        </div>
      </div>

      {/* Members */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-white mb-4">Nutzer</h2>
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <div>
                <p className="text-sm text-white font-medium">{m.name}</p>
                <div className="flex items-center gap-1.5 text-xs text-white/30 mt-0.5">
                  <span>{m.email}</span>
                  {m.lastLoginAt && (
                    <>
                      <span>&middot;</span>
                      <span>Login: {m.lastLoginAt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} {m.lastLoginAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/60 capitalize">{m.role}</span>
              </div>
            </div>
          ))}
        </div>
      </div>


    </div>
  )
}

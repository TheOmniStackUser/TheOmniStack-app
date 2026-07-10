import { requireSuperAdmin } from '@/lib/admin-session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { companies, companyMembers } from '@/db/schema/companies'
import { users } from '@/db/schema/auth'
import { sql, count, gte, lte, and, eq } from 'drizzle-orm'
import Link from 'next/link'

export default async function AdminMerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requireSuperAdmin()

  const params = await searchParams
  const sort = typeof params.sort === 'string' ? params.sort : 'createdAt'
  const order = typeof params.order === 'string' ? params.order : 'desc'

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  // Get all companies with their member count
  const allCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
      email: companies.email,
      createdAt: companies.createdAt,
      trialExpiresAt: companies.trialExpiresAt,
      registeredApp: companies.registeredApp,
      canceledAt: companies.canceledAt,
    })
    .from(companies)

  // Orders this month per company
  const ordersThisMonth = await db
    .select({
      companyId: orders.companyId,
      count: count(orders.id),
    })
    .from(orders)
    .where(gte(orders.createdAt, startOfMonth))
    .groupBy(orders.companyId)

  // Orders last month per company
  const ordersLastMonth = await db
    .select({
      companyId: orders.companyId,
      count: count(orders.id),
    })
    .from(orders)
    .where(and(gte(orders.createdAt, startOfLastMonth), lte(orders.createdAt, endOfLastMonth)))
    .groupBy(orders.companyId)

  // Total orders per company (all time)
  const ordersTotalByCompany = await db
    .select({
      companyId: orders.companyId,
      count: count(orders.id),
    })
    .from(orders)
    .groupBy(orders.companyId)

  // User count per company
  const usersByCompany = await db
    .select({
      companyId: companyMembers.companyId,
      count: count(companyMembers.id),
    })
    .from(companyMembers)
    .groupBy(companyMembers.companyId)

  // Last login per company
  const userLogins = await db
    .select({
      companyId: companyMembers.companyId,
      lastLoginAt: users.lastLoginAt,
      lastLoginApp: users.lastLoginApp
    })
    .from(companyMembers)
    .innerJoin(users, eq(companyMembers.userId, users.id))

  const latestLoginMap = new Map<string, { time: Date, app: string | null }>()
  for (const row of userLogins) {
    if (row.lastLoginAt) {
      const current = latestLoginMap.get(row.companyId)
      if (!current || row.lastLoginAt > current.time) {
        latestLoginMap.set(row.companyId, { time: row.lastLoginAt, app: row.lastLoginApp })
      }
    }
  }

  const thisMonthMap = new Map(ordersThisMonth.map(r => [r.companyId, Number(r.count)]))
  const lastMonthMap = new Map(ordersLastMonth.map(r => [r.companyId, Number(r.count)]))
  const totalMap = new Map(ordersTotalByCompany.map(r => [r.companyId, Number(r.count)]))
  const usersMap = new Map(usersByCompany.map(r => [r.companyId, Number(r.count)]))

  const monthName = now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
  const lastMonthName = new Date(now.getFullYear(), now.getMonth() - 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })

  const enrichedCompanies = allCompanies.map(company => {
    const thisMonth = thisMonthMap.get(company.id) ?? 0
    const lastMonth = lastMonthMap.get(company.id) ?? 0
    const total = totalMap.get(company.id) ?? 0
    const userCount = usersMap.get(company.id) ?? 0
    const trend = lastMonth === 0 ? null : Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
    const latestLogin = latestLoginMap.get(company.id)

    return {
      ...company,
      thisMonth,
      lastMonth,
      total,
      userCount,
      trend,
      latestLogin
    }
  })

  enrichedCompanies.sort((a, b) => {
    let valA: any = a.createdAt?.getTime() ?? 0
    let valB: any = b.createdAt?.getTime() ?? 0

    switch (sort) {
      case 'name':
        valA = a.name.toLowerCase()
        valB = b.name.toLowerCase()
        break
      case 'app':
        valA = a.registeredApp.toLowerCase()
        valB = b.registeredApp.toLowerCase()
        break
      case 'login':
        valA = a.latestLogin?.time?.getTime() ?? 0
        valB = b.latestLogin?.time?.getTime() ?? 0
        break
      case 'users':
        valA = a.userCount
        valB = b.userCount
        break
      case 'lastMonth':
        valA = a.lastMonth
        valB = b.lastMonth
        break
      case 'thisMonth':
        valA = a.thisMonth
        valB = b.thisMonth
        break
      case 'total':
        valA = a.total
        valB = b.total
        break
      case 'status':
        valA = a.canceledAt ? 1 : 0
        valB = b.canceledAt ? 1 : 0
        break
      case 'trial':
        valA = a.trialExpiresAt?.getTime() ?? 0
        valB = b.trialExpiresAt?.getTime() ?? 0
        break
    }

    if (valA < valB) return order === 'asc' ? -1 : 1
    if (valA > valB) return order === 'asc' ? 1 : -1
    return 0
  })

  const toggleOrder = (col: string) => {
    if (sort === col) {
      return order === 'asc' ? 'desc' : 'asc'
    }
    // Standard-Sortierrichtung für neue Spalte
    if (['users', 'lastMonth', 'thisMonth', 'total', 'login', 'trial'].includes(col)) {
      return 'desc'
    }
    return 'asc'
  }

  const SortHeader = ({ col, label, align = 'left' }: { col: string, label: string, align?: 'left'|'right'|'center' }) => {
    const isActive = sort === col
    const nextOrder = toggleOrder(col)
    
    return (
      <th className={`px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider text-${align}`}>
        <Link 
          href={`?sort=${col}&order=${nextOrder}`}
          className={`group inline-flex items-center gap-1 hover:text-white transition-colors ${align === 'right' ? 'flex-row-reverse' : ''}`}
        >
          {label}
          <span className={`text-[10px] w-2 ${isActive ? 'text-white/60' : 'text-transparent group-hover:text-white/20'}`}>
            {isActive ? (order === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </Link>
      </th>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Händler</h1>
        <p className="text-white/40 mt-1">{allCompanies.length} Accounts registriert</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/10">
                <SortHeader col="name" label="Händler" />
                <SortHeader col="app" label="App" />
                <SortHeader col="login" label="Letzter Login" />
                <SortHeader col="users" label="Nutzer" align="right" />
                <SortHeader col="lastMonth" label={lastMonthName} align="right" />
                <SortHeader col="thisMonth" label={monthName} align="right" />
                <SortHeader col="total" label="Gesamt" align="right" />
                <SortHeader col="status" label="Status" align="center" />
                <SortHeader col="trial" label="Testphase" align="center" />
                <th className="text-right px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {enrichedCompanies.map(company => {
                return (
                  <tr key={company.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-white">{company.name}</p>
                        <p className="text-xs text-white/30 mt-0.5">{company.email || '–'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        company.registeredApp === 'ProfiFaktura'
                          ? 'bg-yellow-500/10 text-yellow-500 ring-yellow-500/20'
                          : 'bg-blue-500/10 text-blue-400 ring-blue-400/20'
                      }`}>
                        {company.registeredApp}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {company.latestLogin ? (
                        <div>
                          <p className="text-sm text-white">{company.latestLogin.time.toLocaleDateString('de-DE')}</p>
                          <p className="text-xs text-white/40">{company.latestLogin.app || 'Unbekannt'}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-white/30">–</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-white/60">{company.userCount}</td>
                    <td className="px-6 py-4 text-right text-white/60">{company.lastMonth}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-semibold text-white">{company.thisMonth}</span>
                        {company.trend !== null && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${company.trend >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                            {company.trend >= 0 ? '+' : ''}{company.trend}%
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-white/40 text-xs">{company.total}</td>
                    <td className="px-6 py-4 text-center">
                      {company.canceledAt ? (
                        <span className="bg-red-500/10 text-red-400 text-[10px] px-2 py-1 rounded-full font-bold">
                          Gekündigt
                        </span>
                      ) : (
                        <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-1 rounded-full font-bold">
                          Aktiv
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {company.trialExpiresAt ? (
                        (() => {
                          const daysLeft = Math.ceil((company.trialExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                          if (daysLeft > 0) {
                            return (
                              <span className="bg-blue-500/10 text-blue-400 text-[10px] px-2 py-1 rounded-full font-bold">
                                {daysLeft} Tage
                              </span>
                            )
                          } else {
                            return (
                              <span className="bg-white/5 text-white/30 text-[10px] px-2 py-1 rounded-full">
                                Abgelaufen
                              </span>
                            )
                          }
                        })()
                      ) : (
                        <span className="text-white/20 text-xs">–</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/admin/merchants/${company.id}`}
                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors font-medium"
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

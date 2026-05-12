import { requireSuperAdmin } from '@/lib/admin-session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { companies, companyMembers } from '@/db/schema/companies'
import { users } from '@/db/schema/auth'
import { sql, count, gte, lte, and, eq } from 'drizzle-orm'
import Link from 'next/link'

export default async function AdminMerchantsPage() {
  await requireSuperAdmin()

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
    })
    .from(companies)
    .orderBy(companies.createdAt)

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

  const thisMonthMap = new Map(ordersThisMonth.map(r => [r.companyId, Number(r.count)]))
  const lastMonthMap = new Map(ordersLastMonth.map(r => [r.companyId, Number(r.count)]))
  const totalMap = new Map(ordersTotalByCompany.map(r => [r.companyId, Number(r.count)]))
  const usersMap = new Map(usersByCompany.map(r => [r.companyId, Number(r.count)]))

  const monthName = now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
  const lastMonthName = new Date(now.getFullYear(), now.getMonth() - 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })

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
                <th className="text-left px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Händler</th>
                <th className="text-right px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Nutzer</th>
                <th className="text-right px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">{lastMonthName}</th>
                <th className="text-right px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">{monthName}</th>
                <th className="text-right px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Gesamt</th>
                <th className="text-right px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {allCompanies.map(company => {
                const thisMonth = thisMonthMap.get(company.id) ?? 0
                const lastMonth = lastMonthMap.get(company.id) ?? 0
                const total = totalMap.get(company.id) ?? 0
                const userCount = usersMap.get(company.id) ?? 0
                const trend = lastMonth === 0 ? null : Math.round(((thisMonth - lastMonth) / lastMonth) * 100)

                return (
                  <tr key={company.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-white">{company.name}</p>
                        <p className="text-xs text-white/30 mt-0.5">{company.email || '–'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-white/60">{userCount}</td>
                    <td className="px-6 py-4 text-right text-white/60">{lastMonth}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-semibold text-white">{thisMonth}</span>
                        {trend !== null && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${trend >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                            {trend >= 0 ? '+' : ''}{trend}%
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-white/40 text-xs">{total}</td>
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

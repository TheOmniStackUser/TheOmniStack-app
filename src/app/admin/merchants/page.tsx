import { requireSuperAdmin } from '@/lib/admin-session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { companies, companyMembers } from '@/db/schema/companies'
import { users } from '@/db/schema/auth'
import { sql, count, gte, lte, and, eq } from 'drizzle-orm'
import { MerchantsTable } from './merchants-table'

export default async function AdminMerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requireSuperAdmin()

  const params = (await searchParams) || {}
  const sort = typeof params.sort === 'string' ? params.sort : 'total'
  const order = typeof params.order === 'string' ? params.order : 'desc'

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  // Get all companies with their member count and complete firm / address data
  const allCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
      legalName: companies.legalName,
      email: companies.email,
      phone: companies.phone,
      website: companies.website,
      street: companies.street,
      zip: companies.zip,
      city: companies.city,
      country: companies.country,
      warehouseStreet: companies.warehouseStreet,
      warehouseZip: companies.warehouseZip,
      warehouseCity: companies.warehouseCity,
      warehouseCountry: companies.warehouseCountry,
      vatId: companies.vatId,
      taxId: companies.taxId,
      bankName: companies.bankName,
      iban: companies.iban,
      bic: companies.bic,
      paymentRecipient: companies.paymentRecipient,
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

  const serializedCompanies = enrichedCompanies.map(c => ({
    ...c,
    createdAt: c.createdAt ? c.createdAt.toISOString() : null,
    trialExpiresAt: c.trialExpiresAt ? c.trialExpiresAt.toISOString() : null,
    canceledAt: c.canceledAt ? c.canceledAt.toISOString() : null,
    latestLogin: c.latestLogin ? {
      time: c.latestLogin.time.toISOString(),
      app: c.latestLogin.app,
    } : null,
  }))

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Händler</h1>
        <p className="text-white/40 mt-1">{allCompanies.length} Accounts registriert</p>
      </div>

      <MerchantsTable
        companies={serializedCompanies}
        sort={sort}
        order={order}
        monthName={monthName}
        lastMonthName={lastMonthName}
      />
    </div>
  )
}

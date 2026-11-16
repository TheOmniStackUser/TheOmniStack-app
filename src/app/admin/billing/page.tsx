import { requireSuperAdmin } from '@/lib/admin-session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { companies } from '@/db/schema/companies'
import { count, gte, and, lte, eq } from 'drizzle-orm'
import { getBillingConfigAction } from '@/app/actions/system-settings'
import { BillingConfigEditor } from './billing-config-editor'
import { BillingTable } from './billing-table'

function getBillingPeriod(createdAt: Date, now: Date) {
  const day = createdAt.getDate()
  // Try current month's anniversary
  let start = new Date(now.getFullYear(), now.getMonth(), day)
  
  if (start > now) {
    // We haven't reached the anniversary day this month, so the period started last month
    start = new Date(now.getFullYear(), now.getMonth() - 1, day)
  }
  
  // End is exactly one month later (at the end of the day before the next anniversary)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, day - 1, 23, 59, 59)
  return { start, end }
}

export default async function AdminBillingPage() {
  await requireSuperAdmin()

  const config = await getBillingConfigAction()
  const now = new Date()

  const allCompanies = await db.select().from(companies)

  const rows = await Promise.all(allCompanies.map(async (c) => {
    const period = getBillingPeriod(c.createdAt, now)
    
    const [orderRes] = await db
      .select({ count: count(orders.id) })
      .from(orders)
      .where(and(
        eq(orders.companyId, c.id),
        gte(orders.createdAt, period.start),
        lte(orders.createdAt, period.end)
      ))

    const orderCount = Number(orderRes?.count ?? 0)
    
    // Calculate price
    const tier = config.tiers.find(t => orderCount <= t.upTo) ?? config.tiers[config.tiers.length - 1]
    let total = orderCount * tier.pricePerOrder
    
    if (total < config.minPrice) {
      total = config.minPrice
    }

    return {
      id: c.id,
      name: c.name,
      legalName: c.legalName,
      street: c.street,
      zip: c.zip,
      city: c.city,
      country: c.country,
      vatId: c.vatId,
      taxId: c.taxId,
      email: c.email,
      phone: c.phone,
      website: c.website,
      bankName: c.bankName,
      iban: c.iban,
      bic: c.bic,
      paymentRecipient: c.paymentRecipient,
      createdAt: c.createdAt ? c.createdAt.toISOString() : null,
      orderCount,
      tier,
      total,
      period: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
    }
  }))

  rows.sort((a, b) => b.total - a.total)

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0)
  const monthName = now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })

  return (
    <div className="p-8">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Abrechnung</h1>
          <p className="text-white/40 mt-1">Status: {monthName}</p>
        </div>
        <BillingConfigEditor initialConfig={config} />
      </div>

      {/* Pricing Tiers Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        {config.tiers.map((tier, index) => (
          <div key={index} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-xs font-semibold text-violet-400 mb-1">
              {tier.upTo === Infinity ? 'Enterprise' : `Bis ${tier.upTo}`}
            </p>
            <p className="text-lg font-bold text-white">{tier.pricePerOrder.toFixed(4)} €</p>
          </div>
        ))}
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
          <p className="text-xs font-semibold text-violet-400 mb-1">Grundgebühr</p>
          <p className="text-lg font-bold text-white">{config.minPrice.toFixed(2)} €</p>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/60">Aktueller Abrechnungsumsatz</p>
            <p className="text-4xl font-bold text-white mt-1">
              {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(grandTotal)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-white/60">Händler gesamt</p>
            <p className="text-4xl font-bold text-violet-400 mt-1">
              {rows.length}
            </p>
          </div>
        </div>
      </div>

      {/* Table with Clickable Merchants */}
      <BillingTable rows={rows} minPrice={config.minPrice} />
    </div>
  )
}


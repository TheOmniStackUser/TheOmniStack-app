import { requireSuperAdmin } from '@/lib/admin-session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { companies } from '@/db/schema/companies'
import { count, gte, and, lte, eq } from 'drizzle-orm'
import { getBillingConfigAction } from '@/app/actions/system-settings'
import { BillingConfigEditor } from './billing-config-editor'

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
      ...c,
      orderCount,
      tier,
      total,
      period
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

      {/* Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[1000px]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Händler</th>
              <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Abrechnungszeitraum</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Bestellungen</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Preis/Stufe</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Betrag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map(row => (
              <tr key={row.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4">
                  <p className="font-medium text-white">{row.name}</p>
                  <p className="text-xs text-white/30">{row.email || '–'}</p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-1.5 py-0.5 bg-violet-500/20 text-violet-400 text-[10px] font-bold rounded uppercase border border-violet-500/20">
                      Jeden {row.createdAt.getDate()}.
                    </span>
                    <p className="text-white font-medium">
                      {row.period.start.toLocaleDateString('de-DE')} – {row.period.end.toLocaleDateString('de-DE')}
                    </p>
                  </div>
                  <p className="text-[10px] text-white/30 uppercase">Zyklus: Monatlich ab Anmeldung</p>
                </td>
                <td className="px-6 py-4 text-right font-semibold text-white">{row.orderCount}</td>
                <td className="px-6 py-4 text-right">
                  <p className="text-white font-mono">{row.tier.pricePerOrder.toFixed(4)} €</p>
                  <p className="text-[10px] text-white/30">Stufe: {row.tier.upTo === Infinity ? '∞' : row.tier.upTo}</p>
                </td>
                <td className="px-6 py-4 text-right font-bold text-white">
                  <div className="flex flex-col items-end">
                    <span>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(row.total)}</span>
                    {row.orderCount * row.tier.pricePerOrder < config.minPrice && (
                      <span className="text-[10px] text-amber-400 font-bold uppercase tracking-tighter">Mindestpreis</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


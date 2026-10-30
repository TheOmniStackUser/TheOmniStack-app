import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { logoutAction } from '@/app/actions/auth'
import { Check, ShieldAlert, Sparkles, ArrowRight, LogOut } from 'lucide-react'
import Link from 'next/link'

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; shop?: string }>
}) {
  const auth = await requireAuth()
  const { error, shop: queryShop } = await searchParams

  const [shopifyIntegration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.type, 'shopify')
      )
    )
    .limit(1)

  const metadata = (shopifyIntegration?.metadata as any) || {}
  const isAlreadyActive = metadata.shopifySubscriptionStatus === 'ACTIVE'
  const isNotShopifyBilled = metadata.isShopifyBilled === false

  if (isAlreadyActive || isNotShopifyBilled) {
    redirect('/dashboard')
  }

  const shop = queryShop || (shopifyIntegration?.environment ? shopifyIntegration.environment.replace('https://', '').replace(/\/$/, '') : null)
  const isDeclined = error === 'declined' || metadata.shopifySubscriptionStatus === 'DECLINED'

  const startBillingUrl = `/api/billing/shopify/start${shop ? `?shop=${encodeURIComponent(shop)}` : ''}`

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-2xl w-full mx-auto space-y-8">
        {/* Header / Brand */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
            <img src="/icon.png" alt="TheOmniStack" className="w-9 h-9 object-contain" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            The<span className="text-cyan-400">Omni</span>Stack
          </h1>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Um TheOmniStack mit deinem Shopify Store zu nutzen, aktiviere bitte dein Abonnement.
          </p>
        </div>

        {/* Warning Banner if charge was declined */}
        {isDeclined && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex items-start gap-4 text-amber-200">
            <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-semibold text-amber-300">Zahlungsgenehmigung abgebrochen</p>
              <p className="text-amber-200/90 leading-relaxed">
                Du hast die Genehmigung des Abonnements in Shopify abgelehnt oder abgebrochen. 
                Ohne ein aktives Abonnement kann TheOmniStack nicht auf deine Bestelldaten zugreifen. 
                Du kannst die Genehmigung jederzeit nachholen.
              </p>
            </div>
          </div>
        )}

        {/* Pricing Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden">
          {/* Subtle glow backdrop */}
          <div className="absolute -top-24 -right-24 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-2">
                <Sparkles className="w-3.5 h-3.5" /> Offizieller Shopify App Store Plan
              </div>
              <h2 className="text-2xl font-bold text-white">TheOmniStack Basis</h2>
              <p className="text-slate-400 text-xs mt-1">Flexibles Mengenmodell für wachsende E-Commerce-Händler</p>
            </div>
            <div className="sm:text-right">
              <div className="text-3xl font-extrabold text-white">9,90 $</div>
              <div className="text-xs text-slate-400 font-medium">pro Monat (USD)</div>
              <div className="text-[11px] font-semibold text-emerald-400 mt-0.5">14 Tage kostenlos testen</div>
            </div>
          </div>

          <div className="py-6 space-y-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Enthaltene Leistungen</p>
            <ul className="space-y-3 text-sm text-slate-300">
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span><strong>14 Tage kostenlose Testphase</strong> – Abrechnung startet erst danach</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span>Inklusive <strong>bis zu 141 Bestellungen</strong> pro Monat</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span>Darüber flexible Mengenstaffel (0,07 € bis 0,0045 € je Bestellung)</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span>Automatische Synchronisation von Bestellungen, Inventar & Rechnungen</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span>Sichere & bequeme Abrechnung direkt über deine Shopify-Rechnung</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span>Monatlich kündbar direkt in deinem Shopify Admin</span>
              </li>
            </ul>
          </div>

          <div className="pt-4 space-y-4">
            <Link
              href={startBillingUrl}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold transition-all shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 group text-base"
            >
              <span>Abonnement mit Shopify aktivieren</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            <p className="text-center text-xs text-slate-500">
              Du wirst zur Genehmigung sicher zu Shopify weitergeleitet. Es fallen in den ersten 14 Tagen keine Gebühren an.
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-4">
          <span>Angemeldet als {auth.role}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Abmelden</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

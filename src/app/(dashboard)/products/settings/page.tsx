import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import { ArrowLeft, Settings2, Info } from 'lucide-react'
import { SyncSettingsClient } from './settings-client'

export const metadata = {
  title: 'Warenwirtschaft Einstellungen - TheOmniStack',
}

export default async function ProductsSettingsPage() {
  const auth = await requireAuth()

  const integrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.isActive, true)
      )
    )
    .orderBy(marketplaceIntegrations.createdAt)

  // Filter out shipping providers
  const marketplaces = integrations.filter(i => i.type !== 'dhl' && i.type !== 'hermes' && i.type !== 'dpd')

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <Link href="/products" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-2">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Zurück zur Warenwirtschaft
          </Link>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-slate-50 text-slate-600 rounded-xl">
              <Settings2 className="w-6 h-6" />
            </div>
            Globale Einstellungen
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Konfiguriere die Synchronisation pro Marktplatz.</p>
          <details className="mt-4 group bg-cyan-50/50 border border-cyan-100 rounded-xl max-w-3xl overflow-hidden cursor-pointer">
            <summary className="flex gap-3 p-3 text-sm text-cyan-900/90 items-center font-medium select-none outline-none">
              <div className="shrink-0 text-cyan-600">
                <Info className="w-5 h-5" />
              </div>
              <span><strong>Zusammenspiel: Globale Einstellungen & Produkt-Einstellungen</strong> (Klicken für Details)</span>
            </summary>
            <div className="px-3 pb-3.5 pt-2 text-sm text-cyan-950/90 leading-relaxed border-t border-cyan-100/60 ml-11 space-y-2.5">
              <p>
                Hier legst du die <strong>allgemeinen Regeln pro Marktplatz</strong> fest. Zusätzlich kannst du an jedem einzelnen Produkt (in der Übersicht oder im Produkt-Mapping) eigene Sync-Haken und Preisregeln setzen:
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-xs text-cyan-950">
                <li>
                  <strong>Beide Ebenen müssen aktiv sein:</strong> Bestände und Preise werden nur übertragen, wenn der jeweilige Abgleich <em>hier global</em> für den Marktplatz eingeschaltet ist <strong>und</strong> <em>am Produkt</em> selbst aktiviert wurde. Ist der Schalter hier aus, wird für diesen Marktplatz nichts gesendet – egal was am Produkt eingestellt ist.
                </li>
                <li>
                  <strong>Preisregeln (Produkt hat Vorrang):</strong> Die hier hinterlegten Preisaufschläge oder Rabatte gelten standardmäßig für alle Produkte dieses Marktplatzes. Wenn du jedoch direkt am Produkt-Mapping eine abweichende Preisregel hinterlegst, überschreibt die Produkt-Regel diese globale Einstellung.
                </li>
              </ul>
            </div>
          </details>
        </div>
      </header>

      <SyncSettingsClient integrations={marketplaces} />
    </div>
  )
}

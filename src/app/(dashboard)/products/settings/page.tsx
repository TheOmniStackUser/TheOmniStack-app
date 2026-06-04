import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import { ArrowLeft, Settings2 } from 'lucide-react'
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
  const marketplaces = integrations.filter(i => i.type !== 'dhl' && i.type !== 'hermes')

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
          <p className="text-slate-500 mt-2 font-medium">Konfigurieren Sie die Synchronisation pro Marktplatz.</p>
        </div>
      </header>

      <SyncSettingsClient integrations={marketplaces} />
    </div>
  )
}

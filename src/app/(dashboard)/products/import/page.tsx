import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { unmappedMarketplaceProducts } from '@/db/schema/products'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import { ArrowLeft, Layers, Database } from 'lucide-react'
import { ImportClient } from './import-client'
import { UnmappedClient } from './unmapped-client'

export const metadata = {
  title: 'Import & Mapping - Produkte',
}

export default async function ProductImportPage() {
  const auth = await requireAuth()

  // Fetch active integrations
  const integrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.isActive, true)
      )
    )

  // Filter out shipping providers
  const marketplaces = integrations.filter(i => i.type !== 'dhl' && i.type !== 'hermes')

  // Fetch unmapped products
  const unmappedProducts = await db
    .select()
    .from(unmappedMarketplaceProducts)
    .where(eq(unmappedMarketplaceProducts.companyId, auth.activeCompanyId))

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <Link href="/products" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-2">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Zurück zur Übersicht
          </Link>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Layers className="w-6 h-6" />
            </div>
            Import & Mapping
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Verknüpfen Sie neue Marktplatz-Artikel mit Ihrem zentralen Bestand.</p>
        </div>

        <ImportClient marketplaces={marketplaces} />
      </header>

      <UnmappedClient unmappedProducts={unmappedProducts} marketplaces={marketplaces} />
    </div>
  )
}

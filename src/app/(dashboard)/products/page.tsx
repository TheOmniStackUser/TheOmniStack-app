import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { products, productMappings } from '@/db/schema/products'
import { eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { Plus, Package, Settings, ServerCrash, AlertTriangle, Info } from 'lucide-react'
import { CsvActions } from './csv-actions'
import { ProductsClient } from './products-client'
import { ManualSyncButton } from './manual-sync-button'

export const metadata = {
  title: 'Produkte - TheOmniStack',
}

export const maxDuration = 300


export default async function ProductsPage() {
  const auth = await requireAuth()

  try {
    // Fetch parent products or standalone products
    const productList = await db
      .select()
      .from(products)
      .where(
        eq(products.companyId, auth.activeCompanyId)
      )
      .orderBy(products.createdAt)

    // Fetch all mappings to include their SKUs and EANs in the client search

  const allMappings = await db
    .select({
      productId: productMappings.productId,
      marketplaceSku: productMappings.marketplaceSku,
      ean: productMappings.ean,
    })
    .from(productMappings)
    .where(eq(productMappings.companyId, auth.activeCompanyId))

  const productsWithMappings = productList.map(p => {
    const pMappings = allMappings.filter(m => m.productId === p.id)
    return {
      ...p,
      mappingSkus: pMappings.map(m => m.marketplaceSku).join(' '),
      mappingEans: pMappings.map(m => m.ean).filter(Boolean).join(' '),
    }
  })

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-cyan-400/10 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-cyan-50 text-cyan-600 rounded-xl">
              <Package className="w-6 h-6" />
            </div>
            Warenwirtschaft
            <span className="text-sm font-bold bg-slate-100 text-slate-600 px-3 py-1 rounded-full border border-slate-200 align-middle shadow-sm">
              {productList.length} Produkte
            </span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Verwalten Sie Ihre {productList.length} Produkte und Marktplatz-Listings zentral.</p>
          <details className="mt-4 group bg-blue-50/50 border border-blue-100 rounded-xl max-w-3xl overflow-hidden cursor-pointer">
            <summary className="flex gap-3 p-3 text-sm text-blue-800/90 items-center font-medium select-none outline-none">
              <div className="shrink-0 text-blue-500">
                <Info className="w-5 h-5" />
              </div>
              <span><strong>TheOmniStack ist Ihr Master-System.</strong> (Klicken für Details)</span>
            </summary>
            <div className="px-3 pb-3 pt-1 text-sm text-blue-800/90 leading-relaxed border-t border-blue-100/50 ml-11">
              Bitte passen Sie manuelle Bestände und Preise immer hier an. 
              Diese werden dann automatisch an alle angebundenen Marktplätze (Otto, About You, etc.) gepusht. 
              <br/><br/>
              <em>Hinweis zu Verkäufen:</em> Eingehende Bestellungen aus den Marktplätzen reduzieren den Bestand hier in TheOmniStack natürlich vollautomatisch. Nur <strong>manuelle Änderungen</strong>, die direkt in Fremdportalen vorgenommen werden, überträgt das System nicht zurück.
            </div>
          </details>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/products/settings"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-50 text-slate-700 font-semibold hover:bg-slate-100 transition-colors border border-slate-200 shadow-sm"
          >
            <Settings className="w-4 h-4" />
            Einstellungen
          </Link>
          <Link
            href="/products/import"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-50 text-slate-700 font-semibold hover:bg-slate-100 transition-colors border border-slate-200 shadow-sm"
          >
            <ServerCrash className="w-4 h-4" />
            Marketplace Import
          </Link>
          <ManualSyncButton />
          <CsvActions />
          <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:from-cyan-400 hover:to-blue-400 shadow-md hover:shadow-lg transition-all duration-300">
            <Plus className="w-4 h-4" />
            Neues Produkt
          </button>
        </div>
      </header>

      <ProductsClient initialProducts={productsWithMappings} />
    </div>
  )
  } catch (error: any) {
    return (
      <div className="max-w-7xl mx-auto p-8 animate-in fade-in">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-900">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-8 h-8 text-rose-500" />
            <h1 className="text-2xl font-bold">Ladefehler auf der Produkte-Seite</h1>
          </div>
          <p className="mb-4">
            Beim Laden der Daten ist ein Fehler aufgetreten. Bitte senden Sie diesen Fehler an den Support:
          </p>
          <pre className="bg-white/50 p-4 rounded-xl text-sm overflow-auto border border-rose-100">
            {error?.message || String(error)}
            {'\n'}
            {error?.stack}
          </pre>
        </div>
      </div>
    )
  }
}

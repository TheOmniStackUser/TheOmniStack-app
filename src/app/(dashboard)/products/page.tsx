import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { products } from '@/db/schema/products'
import { eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { Plus, Package, Settings, ServerCrash } from 'lucide-react'
import { CsvActions } from './csv-actions'
import { ProductsClient } from './products-client'

export const metadata = {
  title: 'Produkte - TheOmniStack',
}

export default async function ProductsPage() {
  const auth = await requireAuth()

  // Fetch parent products or standalone products
  const productList = await db
    .select()
    .from(products)
    .where(
      eq(products.companyId, auth.activeCompanyId)
    )
    .orderBy(products.createdAt)

  // Fetch all mappings to include their SKUs and EANs in the client search
  const { productMappings } = await import('@/db/schema/products')
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
}

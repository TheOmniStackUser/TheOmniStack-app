import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { products } from '@/db/schema/products'
import { eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { Plus, DownloadCloud, Package, Search } from 'lucide-react'

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
      eq(products.companyId, auth.companyId)
    )
    // In a real scenario, we might want to filter isNull(products.parentId) to only show top-level,
    // but for now we'll fetch all or just the top-level. Let's fetch all.
    .orderBy(products.createdAt)

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
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Verwalten Sie Ihre Produkte und Marktplatz-Listings zentral.</p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/products/import"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-50 text-slate-700 font-semibold hover:bg-slate-100 transition-colors border border-slate-200 shadow-sm"
          >
            <DownloadCloud className="w-4 h-4" />
            Import / Mapping
          </Link>
          <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:from-cyan-400 hover:to-blue-400 shadow-md hover:shadow-lg transition-all duration-300">
            <Plus className="w-4 h-4" />
            Neues Produkt
          </button>
        </div>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="SKU, Titel oder EAN suchen..." 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Titel</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Bestand</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Preis (Netto)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Letzte Änderung</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <Package className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-base font-semibold text-slate-900">Keine Produkte gefunden</p>
                      <p className="text-sm mt-1">Importieren Sie Produkte oder legen Sie manuell welche an.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                productList.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-mono font-bold">
                        {product.sku}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{product.title}</div>
                      {product.ean && <div className="text-xs text-slate-500 mt-0.5">EAN: {product.ean}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${Number(product.currentStock) > 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        <span className="font-semibold text-slate-700">{product.currentStock}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-700 font-medium">
                      {Number(product.price).toFixed(2)} €
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm">
                      {new Date(product.updatedAt).toLocaleDateString('de-DE')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link 
                        href={`/products/${product.id}`}
                        className="text-sm font-semibold text-cyan-600 hover:text-cyan-700 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Details &rarr;
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

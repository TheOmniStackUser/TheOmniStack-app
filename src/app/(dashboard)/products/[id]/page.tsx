import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { products, productMappings } from '@/db/schema/products'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import { ArrowLeft, Save, Package, Link as LinkIcon, Settings2, Trash2 } from 'lucide-react'
import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export const metadata = {
  title: 'Produktdetails - TheOmniStack',
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  const { id } = await params

  // Fetch Product
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1)

  if (!product || product.companyId !== auth.activeCompanyId) {
    notFound()
  }

  // Fetch Mappings
  const mappings = await db
    .select()
    .from(productMappings)
    .where(eq(productMappings.productId, product.id))

  const saveProduct = async (formData: FormData) => {
    "use server"
    const auth = await requireAuth()
    
    await db.update(products).set({
      title: formData.get('title') as string,
      sku: formData.get('sku') as string,
      ean: (formData.get('ean') as string) || null,
      description: (formData.get('description') as string) || null,
      price: (formData.get('price') as string) || '0',
      purchasePrice: (formData.get('purchasePrice') as string) || null,
      currentStock: (formData.get('currentStock') as string) || '0',
      weight: (formData.get('weight') as string) || null,
      storageLocation: (formData.get('storageLocation') as string) || null,
      updatedAt: new Date()
    }).where(
      and(
        eq(products.id, product.id),
        eq(products.companyId, auth.activeCompanyId)
      )
    )
    
    revalidatePath(`/products/${product.id}`)
    revalidatePath('/products')
  }

  return (
    <form action={saveProduct} className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <Link href="/products" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-2">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Zurück zur Übersicht
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {product.title}
            </h1>
            <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold font-mono">
              {product.sku}
            </span>
          </div>
        </div>

        <button type="submit" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:from-cyan-400 hover:to-blue-400 shadow-md transition-all duration-300">
          <Save className="w-4 h-4" />
          Speichern
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Master Data */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
              <Package className="w-5 h-5 text-slate-400" />
              <h2 className="text-lg font-bold text-slate-900">Stammdaten</h2>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Titel</label>
                  <input type="text" name="title" defaultValue={product.title} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">SKU</label>
                  <input type="text" name="sku" defaultValue={product.sku} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">EAN / Barcode</label>
                  <input type="text" name="ean" defaultValue={product.ean || ''} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Beschreibung</label>
                <textarea name="description" rows={4} defaultValue={product.description || ''} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all resize-none text-slate-900 placeholder:text-slate-500" />
              </div>
            </div>
          </section>

          {/* Pricing & Inventory */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
              <Settings2 className="w-5 h-5 text-slate-400" />
              <h2 className="text-lg font-bold text-slate-900">Preise & Bestand</h2>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Zentraler Preis (€)</label>
                <input type="number" name="price" step="0.01" defaultValue={Number(product.price)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Einkaufspreis (€)</label>
                <input type="number" name="purchasePrice" step="0.01" defaultValue={product.purchasePrice ? Number(product.purchasePrice) : ''} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Lagerbestand</label>
                <input type="number" name="currentStock" defaultValue={Number(product.currentStock)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all font-bold text-lg text-slate-900 placeholder:text-slate-500" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Gewicht (kg)</label>
                <input type="number" name="weight" step="0.001" defaultValue={product.weight ? Number(product.weight) : ''} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <label className="text-sm font-semibold text-slate-700">Lagerort</label>
                <input type="text" name="storageLocation" defaultValue={product.storageLocation || ''} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" />
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Mappings */}
        <div className="space-y-8">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-slate-400" />
                <h2 className="text-lg font-bold text-slate-900">Marktplatz Mappings</h2>
              </div>
              <span className="bg-cyan-100 text-cyan-800 text-xs font-bold px-2 py-1 rounded-full">
                {mappings.length}
              </span>
            </div>
            
            <div className="divide-y divide-slate-100">
              {mappings.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <p className="text-sm">Keine Marktplätze verknüpft.</p>
                </div>
              ) : (
                mappings.map(mapping => (
                  <div key={mapping.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="uppercase text-xs font-bold tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {mapping.marketplace}
                        </span>
                        <p className="font-mono text-sm font-bold text-slate-700 mt-1">{mapping.marketplaceSku}</p>
                      </div>
                      <button className="text-rose-400 hover:text-rose-600 p-1 bg-rose-50 hover:bg-rose-100 rounded transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Sync Rules */}
                    <div className="space-y-3 mt-4 pt-4 border-t border-slate-100">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" defaultChecked={mapping.syncStock} className="w-4 h-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500" />
                        <span className="text-sm font-medium text-slate-700">Bestand synchronisieren</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" defaultChecked={mapping.syncPrice} className="w-4 h-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500" />
                        <span className="text-sm font-medium text-slate-700">Preis synchronisieren</span>
                      </label>
                      
                      {mapping.syncPrice && (
                        <div className="flex items-center gap-2 pl-7">
                          <select defaultValue={mapping.priceModifierType} className="text-sm border-slate-200 rounded-lg py-1.5 focus:ring-cyan-500 outline-none text-slate-900 bg-white">
                            <option value="none">Kein Aufschlag</option>
                            <option value="percentage">% Aufschlag</option>
                            <option value="fixed">Fixer Aufschlag (€)</option>
                          </select>
                          {mapping.priceModifierType !== 'none' && (
                            <input type="number" defaultValue={Number(mapping.priceModifierValue)} className="w-20 text-sm border-slate-200 rounded-lg py-1.5 focus:ring-cyan-500 outline-none text-slate-900 placeholder:text-slate-500" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100">
              <button className="w-full py-2 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg text-sm hover:bg-slate-100 transition-colors shadow-sm">
                + Mapping hinzufügen
              </button>
            </div>
          </section>
        </div>
      </div>
    </form>
  )
}

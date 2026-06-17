import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { products, productMappings } from '@/db/schema/products'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { MappingSyncRules } from './mapping-sync-rules'
import { AddMappingClient } from './add-mapping-client'
import { DeleteMappingClient } from './delete-mapping-client'
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

  // Fetch Integrations
  const integrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(eq(marketplaceIntegrations.companyId, auth.activeCompanyId))

  const getMarketplaceName = (marketplace: string) => {
    const lower = marketplace.toLowerCase()
    if (lower === 'mirakl_custom') {
      const customInt = integrations.find(i => i.type === 'mirakl_custom')
      if (customInt?.metadata && typeof customInt.metadata === 'object' && 'customName' in customInt.metadata) {
        return customInt.metadata.customName as string
      }
      return 'Mirakl Custom'
    }
    const map: Record<string, string> = {
      amazon: 'Amazon',
      otto: 'Otto',
      mirakl_decathlon: 'Decathlon',
      mirakl_decathlon_eu: 'Decathlon EU',
      mirakl_mediamarkt: 'MediaMarkt',
      shopify: 'Shopify',
      aboutyou: 'About You',
      kaufland: 'Kaufland',
      ebay: 'eBay',
      woocommerce: 'WooCommerce',
      shopware: 'Shopware',
    }
    return map[lower] || marketplace
  }

  const saveProduct = async (formData: FormData) => {
    "use server"
    const auth = await requireAuth()
    
    await db.update(products).set({
      title: formData.get('title') as string,
      sku: formData.get('sku') as string,
      ean: (formData.get('ean') as string) || null,
      description: (formData.get('description') as string) || null,
      category: (formData.get('category') as string) || null,
      brand: (formData.get('brand') as string) || null,
      price: (formData.get('price') as string) || '0',
      purchasePrice: (formData.get('purchasePrice') as string) || null,
      msrp: (formData.get('msrp') as string) || null,
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

    for (const mapping of mappings) {
      const syncStock = formData.get(`mapping_${mapping.id}_syncStock`) === 'on'
      const syncPrice = formData.get(`mapping_${mapping.id}_syncPrice`) === 'on'
      const modifierType = formData.get(`mapping_${mapping.id}_priceModifierType`) as any || 'none'
      const modifierValue = formData.get(`mapping_${mapping.id}_priceModifierValue`) as string || '0'
      
      await db.update(productMappings).set({
        syncStock,
        syncPrice,
        priceModifierType: modifierType,
        priceModifierValue: modifierValue,
        updatedAt: new Date()
      }).where(
        and(
          eq(productMappings.id, mapping.id),
          eq(productMappings.companyId, auth.activeCompanyId)
        )
      )
    }
    
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
                  <label className="text-sm font-semibold text-slate-700">EANs / Barcodes (kommagetrennt)</label>
                  <textarea name="ean" rows={2} defaultValue={product.ean || ''} placeholder="Z.B. 4251439205740, 4251439205741" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all resize-none text-slate-900 placeholder:text-slate-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Kategorie</label>
                  <input type="text" name="category" defaultValue={product.category || ''} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Marke / Brand</label>
                  <input type="text" name="brand" defaultValue={product.brand || ''} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" />
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
                <label className="text-sm font-semibold text-slate-700">UVP (€)</label>
                <input type="number" name="msrp" step="0.01" defaultValue={product.msrp ? Number(product.msrp) : ''} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" />
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
                          {getMarketplaceName(mapping.marketplace)}
                        </span>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="font-mono text-sm font-bold text-slate-700">{mapping.marketplaceSku}</p>
                          {mapping.ean && (
                            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-wide border border-slate-200">
                              EAN: {mapping.ean}
                            </span>
                          )}
                        </div>
                      </div>
                      <DeleteMappingClient mappingId={mapping.id} />
                    </div>

                    {/* Sync Rules */}
                    <MappingSyncRules mapping={mapping} />
                  </div>
                ))
              )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100">
              <AddMappingClient productId={product.id} activeIntegrations={integrations} />
            </div>
          </section>
        </div>
      </div>
    </form>
  )
}

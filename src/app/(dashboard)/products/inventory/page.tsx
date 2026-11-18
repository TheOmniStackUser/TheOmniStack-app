import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { products, productMappings } from '@/db/schema/products'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import { AlertTriangle } from 'lucide-react'
import { InventoryClient } from './inventory-client'

export const metadata = {
  title: 'Laufende Inventur - Produkte - TheOmniStack',
}

export const maxDuration = 300

export default async function InventoryPage() {
  const auth = await requireAuth()

  try {
    const [productList, allMappings] = await Promise.all([
      db
        .select()
        .from(products)
        .where(eq(products.companyId, auth.activeCompanyId))
        .orderBy(products.sku, products.createdAt),
      db
        .select({
          productId: productMappings.productId,
          marketplaceSku: productMappings.marketplaceSku,
          ean: productMappings.ean,
          marketplace: productMappings.marketplace,
          integrationType: marketplaceIntegrations.type,
          integrationMetadata: marketplaceIntegrations.metadata,
        })
        .from(productMappings)
        .innerJoin(marketplaceIntegrations, eq(productMappings.integrationId, marketplaceIntegrations.id))
        .where(
          and(
            eq(productMappings.companyId, auth.activeCompanyId),
            eq(marketplaceIntegrations.isActive, true)
          )
        ),
    ])

    const mappingsByProduct = new Map<string, typeof allMappings>()
    for (const m of allMappings) {
      const list = mappingsByProduct.get(m.productId) || []
      list.push(m)
      mappingsByProduct.set(m.productId, list)
    }

    const enrichedProducts = productList.map(p => {
      const pMappings = mappingsByProduct.get(p.id) || []
      const mappedSkus = Array.from(new Set(pMappings.map(m => m.marketplaceSku).filter(Boolean)))
      const marketplaces = Array.from(
        new Set(
          pMappings.map(m => {
            if (m.integrationType === 'mirakl_custom' && (m.integrationMetadata as any)?.customName) {
              return String((m.integrationMetadata as any).customName)
            }
            return m.marketplace
          })
        )
      )

      return {
        id: p.id,
        sku: p.sku,
        title: p.title,
        ean: p.ean,
        color: p.color,
        size: p.size,
        brand: p.brand,
        category: p.category,
        storageLocation: p.storageLocation,
        currentStock: Number(p.currentStock || 0),
        price: Number(p.price || 0),
        purchasePrice: p.purchasePrice !== null && p.purchasePrice !== undefined ? Number(p.purchasePrice) : null,
        msrp: p.msrp !== null && p.msrp !== undefined ? Number(p.msrp) : null,
        reducedPrice: p.reducedPrice !== null && p.reducedPrice !== undefined ? Number(p.reducedPrice) : null,
        taxRate: p.taxRate ? parseFloat(p.taxRate) : 0.19,
        isPreorder: p.isPreorder ?? false,
        updatedAt: p.updatedAt ? p.updatedAt.toISOString() : new Date().toISOString(),
        mappedSkus,
        mappingSkusSearch: mappedSkus.join(' '),
        mappingEansSearch: pMappings.map(m => m.ean).filter(Boolean).join(' '),
        marketplaces,
      }
    })

    return (
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
        <InventoryClient initialProducts={enrichedProducts} />
      </div>
    )
  } catch (error: any) {
    return (
      <div className="max-w-7xl mx-auto p-8 animate-in fade-in">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-900">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-8 h-8 text-rose-500" />
            <h1 className="text-2xl font-bold">Ladefehler auf der Inventur-Seite</h1>
          </div>
          <p className="mb-4">Beim Laden der Inventurdaten ist ein Fehler aufgetreten:</p>
          <pre className="bg-white/50 p-4 rounded-xl text-sm overflow-auto border border-rose-100">
            {error?.message || String(error)}
          </pre>
        </div>
      </div>
    )
  }
}

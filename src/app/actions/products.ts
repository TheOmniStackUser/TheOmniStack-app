'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and, inArray } from 'drizzle-orm'
import { products, productMappings, unmappedMarketplaceProducts } from '@/db/schema/products'
import { revalidatePath } from 'next/cache'

export type MarketplaceSyncSettings = {
  enabled: boolean
  syncStock: boolean
  syncPrice: boolean
  priceModifierType: 'none' | 'percentage' | 'fixed'
  priceModifierValue: number
  syncIntervalHours?: number // Default is 1 if not provided
}

export async function updateMarketplaceSyncSettings(
  integrationId: string,
  settings: MarketplaceSyncSettings
) {
  const auth = await requireAuth()

  // First verify the integration belongs to the company
  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.id, integrationId),
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId)
      )
    )
    .limit(1)

  if (!integration) {
    throw new Error('Integration nicht gefunden.')
  }

  // Merge the new sync settings into the existing metadata
  const existingMetadata = (integration.metadata as Record<string, any>) || {}
  const updatedMetadata = {
    ...existingMetadata,
    productSync: settings,
  }

  await db
    .update(marketplaceIntegrations)
    .set({ metadata: updatedMetadata })
    .where(eq(marketplaceIntegrations.id, integrationId))

  revalidatePath('/products/settings')
  return { success: true }
}

export async function triggerProductImport(integrationId: string) {
  const auth = await requireAuth()

  // Verify the integration belongs to the company
  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.id, integrationId),
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId)
      )
    )
    .limit(1)

  if (!integration) {
    throw new Error('Integration nicht gefunden.')
  }

  // Import sync function dynamically or statically
  const { syncProductsForCompany } = await import('@/workers/product-sync')
  
  // Fire and forget - don't await the full sync to avoid timeout on UI
  syncProductsForCompany(auth.activeCompanyId, integrationId).catch(err => {
    console.error(`[ProductsAction] Background sync failed for integration ${integrationId}:`, err)
  })

  // To let the user see new products, we revalidate the import page
  revalidatePath('/products/import')

  return { success: true }
}

export async function bulkCreateProductsFromUnmapped(unmappedProductIds: string[]) {
  const auth = await requireAuth()

  if (!unmappedProductIds || unmappedProductIds.length === 0) {
    throw new Error('Keine Produkte ausgewählt.')
  }

  // Fetch the selected unmapped products
  const selectedUnmapped = await db
    .select()
    .from(unmappedMarketplaceProducts)
    .where(
      and(
        eq(unmappedMarketplaceProducts.companyId, auth.activeCompanyId),
        inArray(unmappedMarketplaceProducts.id, unmappedProductIds)
      )
    )

  for (const unmapped of selectedUnmapped) {
    // Check if the sku already exists as a central product
    const [existing] = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.companyId, auth.activeCompanyId),
          eq(products.sku, unmapped.marketplaceSku)
        )
      )
      .limit(1)

    let productId = existing?.id

    if (!existing) {
      // Create new central product
      const [newProduct] = await db.insert(products).values({
        companyId: auth.activeCompanyId,
        sku: unmapped.marketplaceSku,
        title: unmapped.title,
        price: unmapped.price || '0',
        currentStock: unmapped.stock || '0',
      }).returning({ id: products.id })
      productId = newProduct.id
    }

    if (productId) {
      // Create mapping
      await db.insert(productMappings).values({
        companyId: auth.activeCompanyId,
        productId,
        marketplace: unmapped.marketplace,
        marketplaceSku: unmapped.marketplaceSku,
        marketplaceProductId: unmapped.marketplaceProductId,
        syncStock: true,
        syncPrice: false,
      }).onConflictDoNothing() // Ignore if already mapped

      // Delete from unmapped
      await db.delete(unmappedMarketplaceProducts)
        .where(eq(unmappedMarketplaceProducts.id, unmapped.id))
    }
  }

  revalidatePath('/products')
  revalidatePath('/products/import')
  
  return { success: true }
}

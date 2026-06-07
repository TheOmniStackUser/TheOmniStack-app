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

const getEanFromPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null;
  
  if (Array.isArray(payload.product_references)) {
    const eanRef = payload.product_references.find((r: any) => 
      r.reference_type === 'UC_EAN' || r.reference_type === 'EAN' || r.reference_type === 'UPC'
    );
    if (eanRef && eanRef.reference) return eanRef.reference;
  }
  
  if (payload.barcode) return payload.barcode;
  if (payload.variants && Array.isArray(payload.variants) && payload.variants.length > 0 && payload.variants[0].barcode) {
    return payload.variants[0].barcode;
  }

  if (payload.ean) return payload.ean;
  if (payload.gtin) return payload.gtin;

  return null;
};

const getDescriptionFromPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.product_description) return payload.product_description;
  if (payload.body_html) return payload.body_html;
  if (payload.short_description) return payload.short_description;
  // Fallback to generic description, though for Mirakl this might be the offer condition
  if (payload.description && typeof payload.description === 'string') return payload.description;

  return null;
};

const getOriginPriceFromPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.discount && payload.discount.origin_price !== undefined && payload.discount.origin_price !== null) {
    return String(payload.discount.origin_price);
  }
  
  if (payload.origin_price !== undefined && payload.origin_price !== null) {
    return String(payload.origin_price);
  }
  
  if (payload.msrp !== undefined && payload.msrp !== null) {
    return String(payload.msrp);
  }

  return null;
};

const getCategoryFromPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.category_label) return payload.category_label;
  if (payload.category) return payload.category;
  if (payload.product_type) return payload.product_type;
  
  return null;
};

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
      const ean = getEanFromPayload(unmapped.rawPayload);
      const description = getDescriptionFromPayload(unmapped.rawPayload);
      const originPrice = getOriginPriceFromPayload(unmapped.rawPayload);
      const category = getCategoryFromPayload(unmapped.rawPayload);
      
      const [newProduct] = await db.insert(products).values({
        companyId: auth.activeCompanyId,
        sku: unmapped.marketplaceSku,
        title: unmapped.title,
        description: description || null,
        price: unmapped.price || '0',
        currentStock: unmapped.stock || '0',
        ean: ean || null,
        msrp: originPrice || null,
        category: category || null,
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

export async function deleteProduct(productId: string) {
  const auth = await requireAuth()

  await db.delete(products).where(
    and(
      eq(products.id, productId),
      eq(products.companyId, auth.activeCompanyId)
    )
  )

  revalidatePath('/products')
  return { success: true }
}

export async function deleteUnmappedProducts(unmappedProductIds: string[]) {
  const auth = await requireAuth()

  if (!unmappedProductIds || unmappedProductIds.length === 0) return { success: true }

  await db.delete(unmappedMarketplaceProducts).where(
    and(
      eq(unmappedMarketplaceProducts.companyId, auth.activeCompanyId),
      inArray(unmappedMarketplaceProducts.id, unmappedProductIds)
    )
  )

  revalidatePath('/products/import')
  return { success: true }
}

export async function getImportSyncStatus(integrationId: string) {
  const auth = await requireAuth()

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

  if (!integration) return null

  const metadata = (integration.metadata as any) || {}
  return metadata.syncStatus || null
}

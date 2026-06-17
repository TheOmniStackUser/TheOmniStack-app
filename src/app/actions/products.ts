'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and, inArray, ilike, or } from 'drizzle-orm'
import { products, productMappings, unmappedMarketplaceProducts } from '@/db/schema/products'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

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
  
  // Use Next.js `after` to ensure the background execution is not paused
  // by Vercel Serverless Function freezing when the response is sent.
  after(() => {
    syncProductsForCompany(auth.activeCompanyId, integrationId).catch(err => {
      console.error(`[ProductsAction] Background sync failed for integration ${integrationId}:`, err)
    })
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
  if (payload.EAN) return payload.EAN;
  if (payload.gtin) return payload.gtin;
  if (payload.GTIN) return payload.GTIN;

  return null;
};

const getDescriptionFromPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.product_description) return payload.product_description;
  if (payload.productDescription && typeof payload.productDescription === 'object') {
    if (payload.productDescription.description) return payload.productDescription.description;
    if (payload.productDescription.shortDescription) return payload.productDescription.shortDescription;
  }
  if (payload.body_html) return payload.body_html;
  if (payload.short_description) return payload.short_description;
  // Fallback to generic description, though for Mirakl this might be the offer condition
  if (payload.description && typeof payload.description === 'string') return payload.description;

  return null;
};

const getOriginPriceFromPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null;

  // Otto v5 standard price
  if (payload.standardPrice && payload.standardPrice.amount !== undefined) {
    return String(payload.standardPrice.amount);
  }

  if (payload.discount && payload.discount.origin_price !== undefined && payload.discount.origin_price !== null) {
    return String(payload.discount.origin_price);
  }
  
  if (payload.origin_price !== undefined && payload.origin_price !== null) {
    return String(payload.origin_price);
  }
  
  if (payload.msrp !== undefined && payload.msrp !== null) {
    return String(payload.msrp);
  }

  if (payload.prices && Array.isArray(payload.prices) && payload.prices.length > 0) {
    const priceObj = payload.prices.find((pr: any) => pr.country_code === 'DE') || payload.prices[0]
    if (priceObj && priceObj.retail_price) {
      return String(priceObj.retail_price);
    }
  }

  return null;
};

const getCategoryFromPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.productDescription && payload.productDescription.category) return payload.productDescription.category;
  if (payload.category_label) return payload.category_label;
  if (payload.category) return payload.category;
  if (payload.product_type) return payload.product_type;
  
  return null;
};

const getBrandFromPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.productDescription && payload.productDescription.brand) {
    const b = payload.productDescription.brand;
    if (typeof b === 'string') return b;
    if (typeof b === 'object' && b.name) return String(b.name);
  }

  if (payload.brand !== undefined && payload.brand !== null) {
     if (typeof payload.brand === 'string') return payload.brand;
     if (typeof payload.brand === 'number') return String(payload.brand);
     if (payload.brand.name) return String(payload.brand.name);
  }
  if (payload.vendor) return payload.vendor;
  if (payload.product_brand) return payload.product_brand;
  
  if (Array.isArray(payload.attributes)) {
     const brandAttr = payload.attributes.find((a: any) => a.name === 'Brand' || a.name === 'brand' || a.code === 'brand');
     if (brandAttr && brandAttr.value) return String(brandAttr.value);
  }
  
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
      const brand = getBrandFromPayload(unmapped.rawPayload);
      
      // Dynamically check for salePrice in rawPayload
      let actualPrice = unmapped.price;
      const payload: any = unmapped.rawPayload;
      if (payload && typeof payload === 'object') {
        if (payload.salePrice && payload.salePrice.amount !== undefined) {
           actualPrice = String(payload.salePrice.amount);
        } else if (payload.pricing && payload.pricing.salePrice && payload.pricing.salePrice.amount !== undefined) {
           actualPrice = String(payload.pricing.salePrice.amount);
        }
      }
      
      const [newProduct] = await db.insert(products).values({
        companyId: auth.activeCompanyId,
        sku: unmapped.marketplaceSku,
        title: unmapped.title,
        description: description || null,
        price: actualPrice || '0',
        currentStock: unmapped.stock || '0',
        ean: ean || null,
        msrp: originPrice || null,
        category: category || null,
        brand: brand || null,
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

export async function bulkDeleteProducts(productIds: string[]) {
  const auth = await requireAuth()

  if (!productIds || productIds.length === 0) return { success: true }

  await db.delete(products).where(
    and(
      eq(products.companyId, auth.activeCompanyId),
      inArray(products.id, productIds)
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

export async function searchProducts(query: string) {
  const auth = await requireAuth()
  if (!query) return []
  
  const terms = query.trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  let validProductIds: string[] | null = null

  for (const term of terms) {
    const termMatches = await db
      .select({ id: products.id })
      .from(products)
      .leftJoin(productMappings, eq(products.id, productMappings.productId))
      .where(
        and(
          eq(products.companyId, auth.activeCompanyId),
          or(
            ilike(products.sku, `%${term}%`),
            ilike(products.title, `%${term}%`),
            ilike(products.ean, `%${term}%`),
            ilike(productMappings.marketplaceSku, `%${term}%`),
            ilike(productMappings.ean, `%${term}%`)
          )
        )
      )
    
    const ids = [...new Set(termMatches.map(m => m.id))]
    
    if (validProductIds === null) {
      validProductIds = ids
    } else {
      validProductIds = validProductIds.filter(id => ids.includes(id))
    }
    
    if (validProductIds.length === 0) break
  }

  if (!validProductIds || validProductIds.length === 0) return []

  const results = await db
    .select({
      id: products.id,
      sku: products.sku,
      title: products.title,
      price: products.price,
      currentStock: products.currentStock,
      ean: products.ean,
    })
    .from(products)
    .where(inArray(products.id, validProductIds.slice(0, 20)))

  return results
}

export async function getSuggestedProducts(sku: string, ean: string | null) {
  const auth = await requireAuth()
  if (!sku && !ean) return []
  
  const conditions = []
  if (sku) conditions.push(eq(products.sku, sku))
  if (ean) conditions.push(ilike(products.ean, `%${ean}%`))
  
  if (conditions.length === 0) return []

  const results = await db
    .select({
      id: products.id,
      sku: products.sku,
      title: products.title,
      price: products.price,
      currentStock: products.currentStock,
      ean: products.ean,
    })
    .from(products)
    .where(
      and(
        eq(products.companyId, auth.activeCompanyId),
        or(...conditions)
      )
    )
    .limit(5)
    
  return results
}

export async function mapUnmappedProductToExisting(unmappedProductId: string, productId: string) {
  const auth = await requireAuth()

  const [unmapped] = await db
    .select()
    .from(unmappedMarketplaceProducts)
    .where(
      and(
        eq(unmappedMarketplaceProducts.companyId, auth.activeCompanyId),
        eq(unmappedMarketplaceProducts.id, unmappedProductId)
      )
    )
    .limit(1)

  if (!unmapped) throw new Error('Unmapped product not found.')

  const [central] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.companyId, auth.activeCompanyId),
        eq(products.id, productId)
      )
    )
    .limit(1)

  if (!central) throw new Error('Central product not found.')

  const unmappedEan = getEanFromPayload(unmapped.rawPayload);

  // Create mapping
  await db.insert(productMappings).values({
    companyId: auth.activeCompanyId,
    productId: central.id,
    marketplace: unmapped.marketplace,
    marketplaceSku: unmapped.marketplaceSku,
    marketplaceProductId: unmapped.marketplaceProductId,
    syncStock: true,
    syncPrice: false,
    ean: unmappedEan || null,
  }).onConflictDoNothing()

  if (unmappedEan) {
    const existingEans = central.ean ? central.ean.split(',').map((s: string) => s.trim()) : [];
    if (!existingEans.includes(unmappedEan)) {
      existingEans.push(unmappedEan);
      await db.update(products).set({
        ean: existingEans.join(', '),
        updatedAt: new Date()
      }).where(eq(products.id, central.id));
    }
  }

  await db.delete(unmappedMarketplaceProducts)
    .where(eq(unmappedMarketplaceProducts.id, unmapped.id))

  revalidatePath('/products')
  revalidatePath('/products/import')
  
  return { success: true }
}

export async function addManualMapping(productId: string, marketplace: string, sku: string, ean: string) {
  const auth = await requireAuth()
  
  await db.insert(productMappings).values({
    companyId: auth.activeCompanyId,
    productId,
    marketplace: marketplace as any,
    marketplaceSku: sku,
    ean: ean || null,
    syncStock: true,
    syncPrice: false,
  }).onConflictDoNothing()
}

export async function getAutoMappableProducts() {
  const auth = await requireAuth()

  const unmapped = await db
    .select()
    .from(unmappedMarketplaceProducts)
    .where(eq(unmappedMarketplaceProducts.companyId, auth.activeCompanyId))

  if (unmapped.length === 0) return []

  const unmappedWithKeys = unmapped.map(p => ({
    ...p,
    ean: getEanFromPayload(p.rawPayload)
  }))

  const eans = [...new Set(unmappedWithKeys.filter(p => !!p.ean).map(p => p.ean as string))]
  const skus = [...new Set(unmappedWithKeys.map(p => p.marketplaceSku))]

  const conditions = []
  if (eans.length > 0) conditions.push(or(...eans.map(e => ilike(products.ean, `%${e}%`))))
  if (skus.length > 0) conditions.push(inArray(products.sku, skus))
  if (conditions.length === 0) return []

  const existing = await db
    .select({
      id: products.id,
      sku: products.sku,
      title: products.title,
      ean: products.ean,
    })
    .from(products)
    .where(
      and(
        eq(products.companyId, auth.activeCompanyId),
        or(...conditions)
      )
    )

  const eanMap = new Map()
  const skuMap = new Map()
  for (const prod of existing) {
    if (prod.ean) {
      const prodEans = prod.ean.split(',').map((s: string) => s.trim())
      for (const e of prodEans) {
        if (!eanMap.has(e)) eanMap.set(e, prod)
      }
    }
    if (prod.sku && !skuMap.has(prod.sku)) skuMap.set(prod.sku, prod)
  }

  const matches = []
  for (const u of unmappedWithKeys) {
    const match = skuMap.get(u.marketplaceSku) || (u.ean ? eanMap.get(u.ean) : null)
    if (match) {
      matches.push({
        unmappedId: u.id,
        unmappedSku: u.marketplaceSku,
        unmappedTitle: u.title,
        unmappedMarketplace: u.marketplace,
        ean: u.ean,
        matchedProductId: match.id,
        matchedProductSku: match.sku,
        matchedProductTitle: match.title,
        matchReason: match.sku === u.marketplaceSku ? 'SKU' : 'EAN'
      })
    }
  }

  return matches
}

export async function bulkAutoMapProducts(mappings: { unmappedId: string, matchedProductId: string }[]) {
  const auth = await requireAuth()

  for (const mapping of mappings) {
     try {
       await mapUnmappedProductToExisting(mapping.unmappedId, mapping.matchedProductId)
     } catch (err) {
       console.error('Failed to auto-map:', err)
     }
  }
  return { success: true }
}

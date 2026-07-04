'use server'


import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and, inArray, ilike, or } from 'drizzle-orm'
import { products, productMappings, unmappedMarketplaceProducts } from '@/db/schema/products'
import { revalidatePath, unstable_noStore } from 'next/cache'
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

  // Clear previous sync status immediately to prevent race conditions on the client
  const metadata = (integration.metadata as any) || {}
  metadata.syncStatus = { isRunning: true, status: 'starting', message: 'Import wird im Hintergrund gestartet...', progress: 0, total: 0, lastUpdated: Date.now() }
  await db.update(marketplaceIntegrations).set({ metadata }).where(eq(marketplaceIntegrations.id, integrationId))

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

  if (payload.pricing?.msrp?.amount !== undefined) {
    return String(payload.pricing.msrp.amount);
  }
  if (payload.pricing?.standardPrice?.amount !== undefined) {
    return String(payload.pricing.standardPrice.amount);
  }

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

  if (selectedUnmapped.length === 0) {
    return { success: true }
  }

  const chunkSize = 500
  for (let i = 0; i < selectedUnmapped.length; i += chunkSize) {
    const chunk = selectedUnmapped.slice(i, i + chunkSize)
    const chunkSkus = [...new Set(chunk.map(u => u.marketplaceSku))]

    // 1. Fetch existing products for this chunk
    const existingProducts = await db
      .select({ id: products.id, sku: products.sku, ean: products.ean })
      .from(products)
      .where(
        and(
          eq(products.companyId, auth.activeCompanyId),
          inArray(products.sku, chunkSkus)
        )
      )

    const existingSkuMap = new Map(existingProducts.map(p => [p.sku, p]))
    
    // 2. Prepare new products to insert
    const newProductsToInsert = []
    const seenSkusToInsert = new Set<string>()

    for (const unmapped of chunk) {
      if (!existingSkuMap.has(unmapped.marketplaceSku) && !seenSkusToInsert.has(unmapped.marketplaceSku)) {
        seenSkusToInsert.add(unmapped.marketplaceSku)
        
        const ean = getEanFromPayload(unmapped.rawPayload);
        const description = getDescriptionFromPayload(unmapped.rawPayload);
        const originPrice = getOriginPriceFromPayload(unmapped.rawPayload);
        const category = getCategoryFromPayload(unmapped.rawPayload);
        const brand = getBrandFromPayload(unmapped.rawPayload);
        
        let actualPrice = unmapped.price;
        const payload: any = unmapped.rawPayload;
        if (payload && typeof payload === 'object') {
          if (payload.salePrice && payload.salePrice.amount !== undefined) {
             actualPrice = String(payload.salePrice.amount);
          } else if (payload.pricing && payload.pricing.salePrice && payload.pricing.salePrice.amount !== undefined) {
             actualPrice = String(payload.pricing.salePrice.amount);
          }
        }

        let safePrice = '0'
        if (actualPrice) {
          const parsed = parseFloat(String(actualPrice).replace(',', '.'))
          if (!isNaN(parsed)) safePrice = String(parsed)
        }

        let safeStock = '0'
        if (unmapped.stock) {
           const parsed = parseInt(String(unmapped.stock), 10)
           if (!isNaN(parsed)) safeStock = String(parsed)
        }

        let safeMsrp = null
        if (originPrice) {
           const parsed = parseFloat(String(originPrice).replace(',', '.'))
           if (!isNaN(parsed)) safeMsrp = String(parsed)
        }

        newProductsToInsert.push({
          companyId: auth.activeCompanyId,
          sku: unmapped.marketplaceSku,
          title: unmapped.title || unmapped.marketplaceSku || 'Ohne Titel',
          description: description || null,
          price: safePrice,
          currentStock: safeStock,
          ean: ean || null,
          msrp: safeMsrp,
          category: category || null,
          brand: brand || null,
        })
      }
    }

    // 3. Bulk insert new products
    let insertedProducts: { id: string, sku: string }[] = []
    if (newProductsToInsert.length > 0) {
      insertedProducts = await db.insert(products).values(newProductsToInsert).returning({ id: products.id, sku: products.sku })
    }

    // Combine existing and newly inserted to get all Product IDs
    const skuToProductId = new Map<string, string>()
    for (const p of existingProducts) skuToProductId.set(p.sku, p.id)
    for (const p of insertedProducts) skuToProductId.set(p.sku, p.id)

    const skuToEan = new Map<string, string | null>()
    for (const p of existingProducts) skuToEan.set(p.sku, p.ean ? p.ean.split(',')[0].trim() : null)
    for (const p of newProductsToInsert) skuToEan.set(p.sku, p.ean || null)

    // 4. Prepare mappings to insert
    const mappingsToInsert = []
    const seenMappings = new Set<string>()

    for (const unmapped of chunk) {
      const productId = skuToProductId.get(unmapped.marketplaceSku)
      if (productId) {
        const mappingKey = `${unmapped.marketplace}-${unmapped.marketplaceSku}`
        if (!seenMappings.has(mappingKey)) {
          seenMappings.add(mappingKey)
          mappingsToInsert.push({
            companyId: auth.activeCompanyId,
            productId,
            marketplace: unmapped.marketplace,
            integrationId: unmapped.integrationId,
            marketplaceSku: unmapped.marketplaceSku,
            marketplaceProductId: unmapped.marketplaceProductId,
            syncStock: unmapped.stock !== null && unmapped.stock !== undefined,
            syncPrice: false,
            ean: skuToEan.get(unmapped.marketplaceSku) || null,
          })
        }
      }
    }

    // 5. Bulk insert mappings
    if (mappingsToInsert.length > 0) {
      await db.insert(productMappings).values(mappingsToInsert).onConflictDoNothing()
    }

    // 6. Delete chunk from unmapped marketplace products
    const chunkIds = chunk.map(u => u.id)
    if (chunkIds.length > 0) {
      await db.delete(unmappedMarketplaceProducts).where(
        and(
          eq(unmappedMarketplaceProducts.companyId, auth.activeCompanyId),
          inArray(unmappedMarketplaceProducts.id, chunkIds)
        )
      )
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
  unstable_noStore()
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
  const status = metadata.syncStatus || null

  if (status && status.isRunning && status.lastUpdated) {
    const timeSinceLastUpdate = Date.now() - status.lastUpdated;
    // If no update for 2 minutes, assume the process was killed by Vercel
    if (timeSinceLastUpdate > 120000) {
      const errorStatus = {
        isRunning: false,
        status: 'error',
        message: 'Der Import-Prozess wurde wegen Zeitüberschreitung abgebrochen (Vercel Timeout).',
        progress: status.progress,
        total: status.total,
        lastUpdated: Date.now()
      };
      
      // Update DB to clear the stuck state asynchronously
      metadata.syncStatus = errorStatus;
      db.update(marketplaceIntegrations).set({ metadata }).where(eq(marketplaceIntegrations.id, integrationId)).catch(console.error);
      
      return errorStatus;
    }
  }

  return status
}

export async function searchProducts(query: string, field: 'all' | 'sku' | 'ean' | 'title' = 'all') {
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
            (field === 'all' || field === 'sku') ? ilike(products.sku, `%${term}%`) : undefined,
            (field === 'all' || field === 'title') ? ilike(products.title, `%${term}%`) : undefined,
            (field === 'all' || field === 'ean') ? ilike(products.ean, `%${term}%`) : undefined,
            (field === 'all' || field === 'sku') ? ilike(productMappings.marketplaceSku, `%${term}%`) : undefined,
            (field === 'all' || field === 'ean') ? ilike(productMappings.ean, `%${term}%`) : undefined
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
    integrationId: unmapped.integrationId,
    marketplaceSku: unmapped.marketplaceSku,
    marketplaceProductId: unmapped.marketplaceProductId,
    syncStock: unmapped.stock !== null && unmapped.stock !== undefined,
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

  // Trigger marketplace sync so the newly mapped marketplace product gets the central stock
  if (central.currentStock !== null) {
    const { pushUpdatesToMarketplaces } = await import('@/workers/product-sync')
    // We use `after` so we don't block the UI response
    import('next/server').then(({ after }) => {
      after(async () => {
        try {
          await pushUpdatesToMarketplaces(auth.activeCompanyId, [{
            sku: central.sku,
            stock: parseInt(central.currentStock?.toString() || '0', 10)
          }])
        } catch (e) {
          console.error('[mapUnmappedProduct] Failed to push stock updates', e)
        }
      })
    }).catch(console.error)
  }

  revalidatePath('/products')
  revalidatePath('/products/import')
  
  return { success: true }
}

export async function addManualMapping(productId: string, integrationId: string, sku: string, ean: string) {
  const auth = await requireAuth()
  
  const [integration] = await db.select().from(marketplaceIntegrations).where(
    and(
      eq(marketplaceIntegrations.id, integrationId),
      eq(marketplaceIntegrations.companyId, auth.activeCompanyId)
    )
  ).limit(1)

  if (!integration) throw new Error('Integration nicht gefunden.')
  
  let finalEan = ean || null
  if (!finalEan) {
    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1)
    if (product && product.ean) {
      finalEan = product.ean.split(',')[0].trim()
    }
  }

  await db.insert(productMappings).values({
    companyId: auth.activeCompanyId,
    productId,
    marketplace: integration.type as any,
    integrationId: integration.id,
    marketplaceSku: sku,
    ean: finalEan,
    syncStock: true,
    syncPrice: false,
  }).onConflictDoNothing()
}

export async function deleteMapping(mappingId: string) {
  const auth = await requireAuth()
  
  const [mappingToDelete] = await db.select().from(productMappings).where(
    and(
      eq(productMappings.id, mappingId),
      eq(productMappings.companyId, auth.activeCompanyId)
    )
  )

  if (!mappingToDelete) return;

  // Re-create it in unmappedMarketplaceProducts so it shows up in the import list again
  await db.insert(unmappedMarketplaceProducts).values({
    companyId: auth.activeCompanyId,
    marketplace: mappingToDelete.marketplace,
    marketplaceSku: mappingToDelete.marketplaceSku,
    marketplaceProductId: mappingToDelete.marketplaceProductId,
    title: mappingToDelete.marketplaceSku, // Fallback title
    updatedAt: new Date()
  }).onConflictDoUpdate({
    target: [unmappedMarketplaceProducts.companyId, unmappedMarketplaceProducts.marketplace, unmappedMarketplaceProducts.marketplaceSku],
    set: {
      updatedAt: new Date()
    }
  })

  // Delete the mapping
  await db.delete(productMappings).where(eq(productMappings.id, mappingId))
}

export async function updateProductStockInline(productId: string, newStock: number) {
  const auth = await requireAuth()

  // Verify and get the product
  const [product] = await db.select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.companyId, auth.activeCompanyId)))

  if (!product) throw new Error("Product not found")

  // Update central stock
  await db.update(products)
    .set({ currentStock: newStock.toString(), updatedAt: new Date() })
    .where(eq(products.id, productId))

  // Trigger sync
  const { pushUpdatesToMarketplaces } = await import('@/workers/product-sync')
  await pushUpdatesToMarketplaces(auth.activeCompanyId, [{
    sku: product.sku,
    stock: newStock
  }])

  return { success: true }
}

export async function updateProductPriceInline(productId: string, newPrice: number) {
  const auth = await requireAuth()

  // Verify and get the product
  const [product] = await db.select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.companyId, auth.activeCompanyId)))

  if (!product) throw new Error("Product not found")

  // Update central price
  await db.update(products)
    .set({ price: newPrice.toString(), updatedAt: new Date() })
    .where(eq(products.id, productId))

  // Trigger sync
  const { pushUpdatesToMarketplaces } = await import('@/workers/product-sync')
  await pushUpdatesToMarketplaces(auth.activeCompanyId, [{
    sku: product.sku,
    price: newPrice
  }])

  return { success: true }
}

export async function triggerGlobalMarketplaceSync() {
  const auth = await requireAuth()

  // Fetch all products
  const allProducts = await db
    .select({
      sku: products.sku,
      currentStock: products.currentStock,
      price: products.price
    })
    .from(products)
    .where(eq(products.companyId, auth.activeCompanyId))

  if (allProducts.length === 0) return { totalUpdatesSent: 0, activeMarketplaces: [] }

  // Prepare updates payload
  const updates = allProducts.map(p => ({
    sku: p.sku,
    stock: p.currentStock !== null && p.currentStock !== undefined ? Number(p.currentStock) : undefined,
    price: p.price !== null && p.price !== undefined ? Number(p.price) : undefined
  }))

  const { pushUpdatesToMarketplaces } = await import('@/workers/product-sync')

  // Push all updates. pushUpdatesToMarketplaces groups them by integration
  return await pushUpdatesToMarketplaces(auth.activeCompanyId, updates)
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
    const skuMatch = skuMap.get(u.marketplaceSku)
    const eanMatch = u.ean ? eanMap.get(u.ean) : null

    const match = skuMatch || eanMatch
    if (match) {
      const isSkuMatch = skuMatch && skuMatch.id === match.id
      const isEanMatch = eanMatch && eanMatch.id === match.id
      let matchReason = isSkuMatch ? 'SKU' : 'EAN'
      if (isSkuMatch && isEanMatch) {
        matchReason = 'SKU & EAN'
      }

      matches.push({
        unmappedId: u.id,
        unmappedSku: u.marketplaceSku,
        unmappedTitle: u.title,
        unmappedMarketplace: u.marketplace,
        ean: u.ean,
        matchedProductId: match.id,
        matchedProductSku: match.sku,
        matchedProductTitle: match.title,
        matchReason
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

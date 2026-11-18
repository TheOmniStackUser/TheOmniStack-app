import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { products, productMappings, unmappedMarketplaceProducts, productSyncLogs } from '@/db/schema/products'
import { eq, and, inArray, sql, lte } from 'drizzle-orm'
import { Worker, Queue, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { getAdapterForIntegration } from '@/workers/marketplace-sync'
import { getShopifyStoreName } from '@/lib/marketplaces'
import { evaluatePriceRulesForProduct } from '@/lib/pricing-rules'

export const QUEUE_PRODUCT_SYNC = process.env.NODE_ENV === 'production' ? 'product-sync' : 'product-sync-dev'

let _redisConnection: IORedis | null = null
function getRedisConnection(): IORedis {
  if (!_redisConnection) {
    _redisConnection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    })
    _redisConnection.on('error', (err) => {
      console.error('[Redis Error in product-sync]', err)
    })
  }
  return _redisConnection
}

let _productSyncQueue: Queue | null = null
export function getProductSyncQueue(): Queue {
  if (!_productSyncQueue) {
    _productSyncQueue = new Queue(QUEUE_PRODUCT_SYNC, { connection: getRedisConnection() })
  }
  return _productSyncQueue
}

export type ProductSyncJobData = {
  companyId: string
  integrationId?: string
  action?: 'import' | 'push_all'
}

export function createProductSyncWorker() {
  return new Worker<ProductSyncJobData>(
    QUEUE_PRODUCT_SYNC,
    async (job: Job<ProductSyncJobData>) => {
      const { companyId, integrationId, action } = job.data
      console.log(`[ProductSync Worker] Starting job ${job.id} for company ${companyId}`)
      
      if (action === 'push_all') {
        const allProducts = await db
          .select({
            sku: products.sku,
            currentStock: products.currentStock,
            price: products.price,
            msrp: products.msrp,
            reducedPrice: products.reducedPrice,
            saleStartDate: products.saleStartDate,
            saleEndDate: products.saleEndDate
          })
          .from(products)
          .where(eq(products.companyId, companyId))

        const updates = allProducts.map(p => ({
          sku: p.sku,
          stock: p.currentStock !== null && p.currentStock !== undefined ? Number(p.currentStock) : undefined,
          price: p.price !== null && p.price !== undefined ? Number(p.price) : undefined,
          msrp: p.msrp !== null && p.msrp !== undefined ? Number(p.msrp) : undefined,
          reducedPrice: p.reducedPrice !== null && p.reducedPrice !== undefined ? Number(p.reducedPrice) : undefined,
          saleStartDate: p.saleStartDate ? p.saleStartDate : undefined,
          saleEndDate: p.saleEndDate ? p.saleEndDate : undefined
        }))

        await pushUpdatesToMarketplaces(companyId, updates, job)
      } else {
        await syncProductsForCompany(companyId, integrationId)
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 5,
    }
  )
}


/**
 * Syncs products from activated marketplaces to the central product catalog.
 * This function can be called by a cron job or manual trigger.
 */
async function updateSyncStatus(integrationId: string, status: { isRunning: boolean, status: string, message: string, progress: number, total: number }) {
  try {
    const syncStatusPayload = JSON.stringify({ ...status, lastUpdated: Date.now() })
    await db
      .update(marketplaceIntegrations)
      .set({
        metadata: sql`jsonb_set(COALESCE(${marketplaceIntegrations.metadata}, '{}'::jsonb), '{syncStatus}', ${syncStatusPayload}::jsonb, true)`
      })
      .where(eq(marketplaceIntegrations.id, integrationId))
  } catch (err) {
    console.error(`[ProductSync] Failed to update sync status for ${integrationId}`, err)
  }
}

export async function syncProductsForCompany(companyId: string, integrationId?: string) {
  let query: any = and(
    eq(marketplaceIntegrations.companyId, companyId),
    eq(marketplaceIntegrations.isActive, true)
  )

  if (integrationId) {
    query = and(query, eq(marketplaceIntegrations.id, integrationId))
  }

  const activeIntegrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(query)

  for (const integration of activeIntegrations) {
    try {
      const adapter = getAdapterForIntegration(integration)
      if (!adapter || !adapter.fetchProducts) {
        continue
      }

      console.log(`[ProductSync] Fetching products from ${integration.type} for company ${companyId}...`)
      
      await updateSyncStatus(integration.id, { isRunning: true, status: 'fetching', message: 'Lade Daten vom Marktplatz...', progress: 0, total: 0 })

      const onProgress = async (progress: number, total: number, message: string) => {
        await updateSyncStatus(integration.id, { isRunning: true, status: 'fetching', message, progress, total })
      }

      const marketplaceProducts = await adapter.fetchProducts!(companyId, onProgress)
      const totalCount = marketplaceProducts.length
      
      await updateSyncStatus(integration.id, { isRunning: true, status: 'processing', message: `Bereite ${totalCount} Produkte vor...`, progress: 0, total: totalCount })

      // Bulk Load existing data
      const existingMappings = await db.select().from(productMappings).where(and(eq(productMappings.companyId, companyId), eq(productMappings.integrationId, integration.id)))
      const existingProducts = await db.select({ id: products.id, sku: products.sku, reducedPrice: products.reducedPrice, price: products.price, msrp: products.msrp, saleStartDate: products.saleStartDate, saleEndDate: products.saleEndDate }).from(products).where(eq(products.companyId, companyId))

      const mappedSkus = new Set(existingMappings.map(m => m.marketplaceSku))
      const centralProductMap = new Map(existingProducts.map(p => [p.sku, p]))

      const toAutoMap: any[] = []
      const toUpsertUnmapped: any[] = []

      for (let i = 0; i < marketplaceProducts.length; i++) {
        const mpProduct = marketplaceProducts[i]

        if (!mappedSkus.has(mpProduct.sku)) {
          toUpsertUnmapped.push({
            companyId,
            marketplace: integration.type as any,
            integrationId: integration.id,
            marketplaceSku: String(mpProduct.sku),
            marketplaceProductId: String(mpProduct.marketplaceProductId),
            title: mpProduct.title,
            price: mpProduct.price?.toString() || '0',
            stock: mpProduct.stock !== undefined && mpProduct.stock !== null ? mpProduct.stock.toString() : null,
            rawPayload: mpProduct.rawPayload
          })
        }

        // Update progress in DB every 50 items to not overload DB
        if ((i + 1) % 50 === 0 || i === marketplaceProducts.length - 1) {
          await updateSyncStatus(integration.id, { 
            isRunning: true, 
            status: 'processing', 
            message: `Verarbeite ${i + 1} von ${totalCount} Produkten...`, 
            progress: i + 1, 
            total: totalCount 
          })
        }
      }

      await updateSyncStatus(integration.id, { isRunning: true, status: 'saving', message: `Speichere ${toUpsertUnmapped.length} ungemappte Produkte in die Datenbank...`, progress: totalCount, total: totalCount })

      // Batch Inserts for AutoMap
      if (toAutoMap.length > 0) {
        for (let i = 0; i < toAutoMap.length; i += 100) {
          const chunk = toAutoMap.slice(i, i + 100)
          await db.insert(productMappings).values(chunk).onConflictDoNothing()
        }
      }

      // Batch Inserts for Unmapped
      if (toUpsertUnmapped.length > 0) {
        for (let i = 0; i < toUpsertUnmapped.length; i += 100) {
          const chunk = toUpsertUnmapped.slice(i, i + 100)
          // Preserve isBlocked, blockedAt, and blockedReason so blocked listings stay blocked across syncs
          await db.insert(unmappedMarketplaceProducts).values(chunk).onConflictDoUpdate({
            target: [
              unmappedMarketplaceProducts.companyId,
              unmappedMarketplaceProducts.integrationId,
              unmappedMarketplaceProducts.marketplaceSku
            ],
            set: {
              title: sql`EXCLUDED.title`,
              price: sql`EXCLUDED.price`,
              stock: sql`EXCLUDED.stock`,
              marketplaceProductId: sql`EXCLUDED.marketplace_product_id`,
              rawPayload: sql`EXCLUDED.raw_payload`,
              updatedAt: new Date()
            }
          })
        }
      }

      const alreadyMappedCount = marketplaceProducts.length - toUpsertUnmapped.length
      const meta = integration.metadata as any
      const fallbackNames: Record<string, string> = {
        'otto': 'Otto',
        'mirakl_decathlon': 'Decathlon',
        'mirakl_decathlon_eu': 'Decathlon EU',
        'mirakl_mediamarkt': 'MediaMarkt',
        'aboutyou': 'About You',
        'amazon': 'Amazon',
        'kaufland': 'Kaufland',
        'ebay': 'eBay',
        'etsy': 'Etsy',
        'shopify': 'Shopify',
        'woocommerce': 'WooCommerce',
        'shopware': 'Shopware',
        'mirakl_custom': 'Marktplatz'
      }
      const shopifyName = integration.type === 'shopify' ? getShopifyStoreName(integration) : null
      const displayName = (shopifyName ? `Shopify (${shopifyName})` : null) || meta?.customName || fallbackNames[integration.type] || integration.type

      let doneMessage = `Import abgeschlossen: ${totalCount} Produkte gefunden.`
      if (toUpsertUnmapped.length === 0) {
        doneMessage = `Alle ${totalCount} Produkte von ${displayName} sind bereits verknüpft (gemappt). Es wurden keine neuen ungemappten Produkte gefunden.`
      } else if (alreadyMappedCount > 0) {
        doneMessage = `${toUpsertUnmapped.length} neue ungemappte Produkte von ${displayName} hinzugefügt (${alreadyMappedCount} bereits verknüpft).`
      } else {
        doneMessage = `${toUpsertUnmapped.length} neue ungemappte Produkte von ${displayName} hinzugefügt.`
      }

      await updateSyncStatus(integration.id, { isRunning: false, status: 'done', message: doneMessage, progress: totalCount, total: totalCount })
      console.log(`[ProductSync] Completed ${integration.type}: ${toAutoMap.length} auto-mapped, ${toUpsertUnmapped.length} unmapped.`)
      
    } catch (error: any) {
      console.error(`[ProductSync] Failed to sync products for marketplace ${integration.type}`, error)
      await updateSyncStatus(integration.id, { isRunning: false, status: 'error', message: `Fehler: ${error?.message || 'Ein unbekannter Fehler ist aufgetreten.'}`, progress: 0, total: 0 })
    }
  }
}

/**
 * Pushes inventory and price updates from OmniStack to the mapped marketplaces.
 */
export async function pushUpdatesToMarketplaces(companyId: string, updates: { sku: string, stock?: number, price?: number, reducedPrice?: number, msrp?: number, saleStartDate?: Date | null, saleEndDate?: Date | null }[], job?: Job<any>, targetIntegrationId?: string) {
  console.log(`[ProductSync] Pushing updates for ${updates.length} products for company ${companyId}...`)
  
  if (updates.length === 0) return { totalUpdatesSent: 0, activeMarketplaces: [] }

  const skus = updates.map(u => u.sku)

  // Find all mappings for these SKUs
  // First find central products
  const centralProducts: { id: string, sku: string, isPreorder?: boolean, price?: string | null, reducedPrice?: string | null, msrp?: string | null, saleStartDate?: Date | null, saleEndDate?: Date | null, gpsrDetails?: any, currentStock?: string | null }[] = []
  for (let i = 0; i < skus.length; i += 1000) {
    const chunkSkus = skus.slice(i, i + 1000)
    const chunkProducts = await db
      .select({ id: products.id, sku: products.sku, isPreorder: products.isPreorder, reducedPrice: products.reducedPrice, price: products.price, msrp: products.msrp, saleStartDate: products.saleStartDate, saleEndDate: products.saleEndDate, gpsrDetails: products.gpsrDetails, currentStock: products.currentStock })
      .from(products)
      .where(
        and(
          eq(products.companyId, companyId),
          inArray(products.sku, chunkSkus)
        )
      )
    centralProducts.push(...chunkProducts)
  }

  const [company] = await db.select({ gpsrDetails: companies.gpsrDetails }).from(companies).where(eq(companies.id, companyId)).limit(1)
  const defaultGpsr = company?.gpsrDetails || null


  if (centralProducts.length === 0) {
    console.log("[Debug] No central products found for SKUs:", skus.length, "Company:", companyId)
    return { totalUpdatesSent: 0, activeMarketplaces: [] }
  }
  
  console.log(`[Debug] Found ${centralProducts.length} central products.`)

  const productIds = centralProducts.map(p => p.id)
  
  // Find mappings
  const mappings: typeof productMappings.$inferSelect[] = []
  for (let i = 0; i < productIds.length; i += 1000) {
    const chunkIds = productIds.slice(i, i + 1000)
    const chunkMappings = await db
      .select()
      .from(productMappings)
      .where(
        and(
          eq(productMappings.companyId, companyId),
          inArray(productMappings.productId, chunkIds)
        )
      )
    mappings.push(...chunkMappings)
  }

  // Find active integrations first
  const activeIntegrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, companyId),
        eq(marketplaceIntegrations.isActive, true),
        targetIntegrationId ? eq(marketplaceIntegrations.id, targetIntegrationId) : undefined
      )
    )

  if (activeIntegrations.length === 0) {
    console.log("[Debug] No active integrations found")
    return { totalUpdatesSent: 0, activeMarketplaces: [], failedMarketplaces: [] }
  }

  console.log("[Debug] Found active integrations:", activeIntegrations.map(i => i.id))

  // Group mappings by integrationId
  const updatesByIntegration: Record<string, { sku: string, marketplaceProductId?: string, stock?: number, price?: number, reducedPrice?: number, msrp?: number }[]> = {}

  for (const mapping of mappings) {
    console.log("[Debug] Checking mapping:", mapping.id, mapping.integrationId, mapping.marketplaceSku)
    
    let intId = mapping.integrationId
    let integration = intId ? activeIntegrations.find(i => i.id === intId) : undefined

    // Fallback: If no integrationId is set (e.g. from legacy CSV imports), find the active integration by marketplace type
    if (!integration) {
      integration = activeIntegrations.find(i => i.type === mapping.marketplace)
      if (integration) {
        intId = integration.id
      }
    }

    if (!integration || !intId) {
      console.log("[Debug] Integration not found in active list or by fallback type for mapping:", mapping.id)
      continue
    }

    const productSyncSettings = (integration.metadata as any)?.productSync
    // Default to true if not set to ensure backward compatibility for basic stock sync,
    // but price sync defaults to false since it requires explicit opt-in.
    const isGlobalEnabled = productSyncSettings ? productSyncSettings.enabled : true
    if (!isGlobalEnabled) continue

    const centralProduct = centralProducts.find(p => p.id === mapping.productId)
    if (!centralProduct) continue

    const updateDef = updates.find(u => u.sku === centralProduct.sku)
    if (!updateDef) continue


    const mUpdate: any = {
      sku: mapping.marketplaceSku,
      marketplaceProductId: mapping.marketplaceProductId || undefined,
      gpsrDetails: centralProduct.gpsrDetails || defaultGpsr
    }

    const canSyncStock = productSyncSettings ? productSyncSettings.syncStock !== false : true
    const canSyncPrice = productSyncSettings ? productSyncSettings.syncPrice === true : false

    if (canSyncStock && mapping.syncStock) {
      const resolvedStock = updateDef.stock !== undefined
        ? updateDef.stock
        : (centralProduct.currentStock !== null && centralProduct.currentStock !== undefined
            ? parseFloat(centralProduct.currentStock.toString())
            : undefined)

      if (resolvedStock !== undefined) {
        if (centralProduct.isPreorder) {
          // Pre-order logic:
          // When a product is set to pre-order, positive stock is only transferred to marketplaces
          // where lead times can be adjusted manually (allowPreorder === true).
          // All other marketplaces receive 0 stock.
          const supportsPreorder = !!productSyncSettings?.allowPreorder
          if (resolvedStock > 0) {
            mUpdate.stock = supportsPreorder ? resolvedStock : 0
          } else {
            mUpdate.stock = resolvedStock
          }
        } else {
          mUpdate.stock = resolvedStock
        }
      }
    }

    const hasPriceInUpdate = updateDef.price !== undefined || 
                             updateDef.reducedPrice !== undefined || 
                             updateDef.msrp !== undefined

    const isPriceSyncAllowed = canSyncPrice && mapping.syncPrice === true && hasPriceInUpdate

    if (isPriceSyncAllowed) {
      const rawPrice = updateDef.price !== undefined ? updateDef.price : (centralProduct.price ? parseFloat(centralProduct.price) : undefined)
      const rawReducedPrice = updateDef.reducedPrice !== undefined ? updateDef.reducedPrice : (centralProduct.reducedPrice ? parseFloat(centralProduct.reducedPrice) : undefined)
      const rawMsrp = updateDef.msrp !== undefined ? updateDef.msrp : (centralProduct.msrp ? parseFloat(centralProduct.msrp) : undefined)

      const minPriceThreshold: number | undefined = productSyncSettings?.minPriceThreshold !== undefined && productSyncSettings.minPriceThreshold !== null && productSyncSettings.minPriceThreshold !== ''
        ? parseFloat(productSyncSettings.minPriceThreshold.toString())
        : undefined
      const maxPriceThreshold: number | undefined = productSyncSettings?.maxPriceThreshold !== undefined && productSyncSettings.maxPriceThreshold !== null && productSyncSettings.maxPriceThreshold !== ''
        ? parseFloat(productSyncSettings.maxPriceThreshold.toString())
        : undefined

      const additionalRules = Array.isArray(productSyncSettings?.additionalPriceRules)
        ? productSyncSettings.additionalPriceRules.map((r: any) => ({
            id: r.id,
            priceModifierType: r.priceModifierType || 'none',
            priceModifierValue: parseFloat(r.priceModifierValue?.toString() || '0') || 0,
            priceBase: r.priceBase || 'standard',
            minPriceThreshold: r.minPriceThreshold !== undefined && r.minPriceThreshold !== null && r.minPriceThreshold !== ''
              ? parseFloat(r.minPriceThreshold.toString())
              : undefined,
            maxPriceThreshold: r.maxPriceThreshold !== undefined && r.maxPriceThreshold !== null && r.maxPriceThreshold !== ''
              ? parseFloat(r.maxPriceThreshold.toString())
              : undefined,
          }))
        : []

      const evaluated = evaluatePriceRulesForProduct({
        rawPrice,
        rawReducedPrice,
        rawMsrp,
        primaryRule: {
          priceModifierType: productSyncSettings?.priceModifierType || 'none',
          priceModifierValue: parseFloat(productSyncSettings?.priceModifierValue?.toString() || '0') || 0,
          priceBase: productSyncSettings?.priceBase || 'standard',
          minPriceThreshold,
          maxPriceThreshold,
        },
        additionalRules,
        mappingOverride: mapping,
      })

      const modifiedPrice: number | undefined = evaluated.modifiedPrice
      const modifiedReducedPrice: number | undefined = evaluated.modifiedReducedPrice
      const modifiedMsrp: number | undefined = rawMsrp

      // Currency conversion & exchange rate
      const isConversionEnabled = productSyncSettings?.enableCurrencyConversion !== undefined
        ? productSyncSettings.enableCurrencyConversion
        : (productSyncSettings?.targetCurrency ? productSyncSettings.targetCurrency !== 'EUR' : ((integration.metadata as any)?.customName?.toLowerCase().includes('se') || (integration.metadata as any)?.shopId === '4362'))

      const targetCurrency = isConversionEnabled
        ? (productSyncSettings?.targetCurrency || (((integration.metadata as any)?.customName?.toLowerCase().includes('se') || (integration.metadata as any)?.shopId === '4362') ? 'SEK' : 'EUR'))
        : 'EUR'
      
      const isSek = targetCurrency === 'SEK'
      const exchangeRate = isConversionEnabled && productSyncSettings?.exchangeRate !== undefined && productSyncSettings.exchangeRate > 0
        ? parseFloat(productSyncSettings.exchangeRate.toString())
        : (isConversionEnabled && isSek ? 11.0 : 1.0)
      
      const roundingMode: 'round' | 'decimals' = productSyncSettings?.roundingMode || (isSek ? 'round' : 'decimals')

      const convertCurrency = (val: number): number => {
        if (!isConversionEnabled || !exchangeRate || exchangeRate === 1.0) return Math.round(val * 100) / 100
        const converted = val * exchangeRate
        if (roundingMode === 'round') {
          return Math.round(converted)
        }
        return Math.round(converted * 100) / 100
      }

      if (modifiedPrice !== undefined) {
        mUpdate.price = convertCurrency(modifiedPrice)
      }
      if (modifiedReducedPrice !== undefined) {
        mUpdate.reducedPrice = modifiedReducedPrice > 0 ? convertCurrency(modifiedReducedPrice) : 0
      }
      if (modifiedMsrp !== undefined) {
        mUpdate.msrp = convertCurrency(modifiedMsrp)
      }

      let modifiedSaleStartDate = updateDef.saleStartDate !== undefined ? (updateDef.saleStartDate ? new Date(updateDef.saleStartDate) : null) : centralProduct.saleStartDate
      let modifiedSaleEndDate = updateDef.saleEndDate !== undefined ? (updateDef.saleEndDate ? new Date(updateDef.saleEndDate) : null) : centralProduct.saleEndDate

      if (modifiedSaleStartDate) mUpdate.saleStartDate = modifiedSaleStartDate
      if (modifiedSaleEndDate) mUpdate.saleEndDate = modifiedSaleEndDate;

      (mUpdate as any).fallbackPrice = mUpdate.price || 0
    }

    // Only push if there is an actual stock or price update for this marketplace
    if (mUpdate.stock !== undefined || mUpdate.price !== undefined || mUpdate.reducedPrice !== undefined || mUpdate.msrp !== undefined) {
      if (!updatesByIntegration[intId]) {
        updatesByIntegration[intId] = []
      }
      updatesByIntegration[intId].push(mUpdate)
    }
  }

  let totalUpdatesSent = 0
  const activeMarketplaces: string[] = []
  const failedMarketplaces: { name: string, error: string }[] = []

  // 1. Delete logs older than 30 days
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await db.delete(productSyncLogs).where(lte(productSyncLogs.startedAt, thirtyDaysAgo))
  } catch (e) {
    console.error('[ProductSync] Failed to cleanup old sync logs:', e)
  }

  const integrationEntries = Object.entries(updatesByIntegration)
  let currentIndex = 0

  const processIntegrationEntry = async ([integrationId, mpUpdates]: [string, any[]]) => {
    const integration = activeIntegrations.find(i => i.id === integrationId)
    if (!integration) {
      currentIndex++
      return
    }

    const marketplace = integration.type
    const adapter = getAdapterForIntegration(integration)
    if (!adapter || !adapter.updateListings || !mpUpdates || mpUpdates.length === 0) {
      currentIndex++
      return
    }

    const meta = integration.metadata as any
    const fallbackNames: Record<string, string> = {
      'otto': 'Otto',
      'mirakl_decathlon': 'Decathlon',
      'aboutyou': 'About You',
      'amazon': 'Amazon',
      'kaufland': 'Kaufland',
      'ebay': 'eBay',
      'etsy': 'Etsy',
      'shopify': 'Shopify',
      'woocommerce': 'WooCommerce',
      'shopware': 'Shopware',
      'mirakl_custom': 'Limango'
    }
    const shopifyName = marketplace === 'shopify' ? getShopifyStoreName(integration) : null
    const displayName = (shopifyName ? `Shopify (${shopifyName})` : null) || meta?.customName || fallbackNames[marketplace] || marketplace

    if (job) {
      await job.updateProgress({
        step: 'pushing',
        integrationIndex: currentIndex,
        totalIntegrations: integrationEntries.length,
        marketplace: displayName,
        updatesCount: mpUpdates.length
      })
    }

    // Prepare log data payload (exclude fallbackPrice to avoid confusion, only show what user actually synced)
    const logPayload = mpUpdates.map((u: any) => ({
      sku: u.sku,
      ...(u.stock !== undefined ? { stock: u.stock } : {}),
      ...(u.price !== undefined ? { price: u.price } : {}),
      ...(u.reducedPrice !== undefined ? { reducedPrice: u.reducedPrice } : {}),
      ...(u.saleStartDate !== undefined ? { saleStartDate: u.saleStartDate } : {}),
      ...(u.saleEndDate !== undefined ? { saleEndDate: u.saleEndDate } : {})
    }))

    // Create sync log
    let logId: string | undefined
    try {
      const inserted = await db.insert(productSyncLogs).values({
        companyId,
        integrationId,
        marketplace: displayName,
        status: 'partial', // temporary status while running
        totalUpdates: mpUpdates.length.toString(),
        syncedSkus: logPayload
      }).returning({ id: productSyncLogs.id })
      logId = inserted[0]?.id
    } catch (e) {
      console.error(`[ProductSync] Failed to create sync log for ${marketplace}:`, e)
    }

    try {
      console.log(`[ProductSync] Pushing ${mpUpdates.length} updates to ${marketplace} (${displayName})...`)
      const adapterResult = (await adapter.updateListings(companyId, mpUpdates)) as any
      totalUpdatesSent += mpUpdates.length
      if (!activeMarketplaces.includes(displayName)) {
        activeMarketplaces.push(displayName)
      }
      
      const failures: { sku: string; error: string }[] = adapterResult?.failures || []
      const isPartial = failures.length > 0

      // Update log payload with per-SKU status
      const finalSyncedSkus = logPayload.map((item: any) => {
        const itemFail = failures.find((f: any) => f.sku === item.sku)
        if (itemFail) {
          return { ...item, status: 'error', error: itemFail.error }
        }
        return { ...item, status: 'success' }
      })

      // Save success or partial status in metadata without overwriting concurrent productSync changes
      const lastPushSyncSuccess = JSON.stringify({
        timestamp: Date.now(),
        status: isPartial ? 'partial' : 'success',
        updatesCount: mpUpdates.length,
        ...(isPartial ? { partialFailures: failures } : {})
      })
      await db
        .update(marketplaceIntegrations)
        .set({
          metadata: sql`jsonb_set(COALESCE(${marketplaceIntegrations.metadata}, '{}'::jsonb), '{lastPushSync}', ${lastPushSyncSuccess}::jsonb, true)`
        })
        .where(eq(marketplaceIntegrations.id, integrationId))

      // Update log to success or partial
      if (logId) {
        await db.update(productSyncLogs).set({
          status: isPartial ? 'partial' : 'success',
          syncedSkus: finalSyncedSkus,
          errorMessage: isPartial ? failures.map((f: any) => `${f.sku}: ${f.error}`).join('; ') : null,
          completedAt: new Date()
        }).where(eq(productSyncLogs.id, logId))
      }

      if (isPartial) {
        failedMarketplaces.push({
          name: `${displayName} (Teilweise fehlgeschlagen)`,
          error: `${failures.length} von ${mpUpdates.length} Artikeln fehlgeschlagen: ${failures.map((f: any) => `${f.sku}: ${f.error}`).join('; ')}`
        })
      }

    } catch (error: any) {
      console.error(`[ProductSync] Failed to push updates to ${marketplace}:`, error)
      failedMarketplaces.push({ name: displayName, error: error.message || 'Unbekannter Fehler' })
      
      // Save error status without overwriting concurrent productSync changes
      const lastPushSyncError = JSON.stringify({
        timestamp: Date.now(),
        status: 'error',
        error: error.message || 'Unbekannter Fehler'
      })
      await db
        .update(marketplaceIntegrations)
        .set({
          metadata: sql`jsonb_set(COALESCE(${marketplaceIntegrations.metadata}, '{}'::jsonb), '{lastPushSync}', ${lastPushSyncError}::jsonb, true)`
        })
        .where(eq(marketplaceIntegrations.id, integrationId))

      // Update log to error
      if (logId) {
        await db.update(productSyncLogs).set({
          status: 'error',
          errorMessage: error.message || 'Unbekannter Fehler',
          completedAt: new Date()
        }).where(eq(productSyncLogs.id, logId))
      }
    }
    
    currentIndex++
  }

  // Group Mirakl integrations sharing the same host URL so they run sequentially per host
  // instead of colliding on Mirakl's per-instance rate limits, while independent marketplaces run in parallel.
  const buckets = new Map<string, [string, any[]][]>()
  for (const entry of integrationEntries) {
    const integration = activeIntegrations.find(i => i.id === entry[0])
    const bucketKey = (integration && integration.type.startsWith('mirakl') && integration.environment)
      ? `mirakl:${integration.environment.replace(/\/$/, '').toLowerCase()}`
      : `int:${entry[0]}`
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, [])
    }
    buckets.get(bucketKey)!.push(entry)
  }

  await Promise.all(Array.from(buckets.values()).map(async (group) => {
    for (let i = 0; i < group.length; i++) {
      await processIntegrationEntry(group[i])
      if (i < group.length - 1) {
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  }))

  if (job) {
    await job.updateProgress({ step: 'completed', totalUpdatesSent, activeMarketplaces, failedMarketplaces })
  }

  return { totalUpdatesSent, activeMarketplaces, failedMarketplaces }
}

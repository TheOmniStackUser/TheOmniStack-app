import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { products, productMappings } from '../src/db/schema/products'
import { eq, and, isNotNull, gt } from 'drizzle-orm'
import { getAdapterForIntegration } from '../src/workers/marketplace-sync'

async function restorePricesForIntegration(integrationId: string) {
  const [integ] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(eq(marketplaceIntegrations.id, integrationId))
    .limit(1)

  if (!integ) {
    console.error(`Integration ${integrationId} not found.`)
    return
  }

  const meta = (integ.metadata as any) || {}
  const shopName = meta.customName || integ.type
  const shopId = meta.shopId
  const baseUrl = integ.environment || 'https://secretsales-prod.mirakl.net'

  console.log(`\n================================================================`)
  console.log(`Restoring Angebotspreise for: ${shopName} (Shop ID: ${shopId})`)
  console.log(`Base URL: ${baseUrl}`)
  console.log(`================================================================`)

  const adapter = getAdapterForIntegration(integ)
  if (!adapter || !adapter.updateListings) {
    console.error(`Adapter does not support updateListings for ${shopName}`)
    return
  }

  // Currency configuration
  const syncSettings = meta.productSync || {}
  const isSekShop = meta.customName?.toLowerCase().includes('se') || shopId === '4362'
  const targetCurrency = syncSettings.targetCurrency || (isSekShop ? 'SEK' : 'EUR')
  const isSek = targetCurrency === 'SEK'
  const exchangeRate = syncSettings.exchangeRate !== undefined && syncSettings.exchangeRate > 0
    ? parseFloat(syncSettings.exchangeRate.toString())
    : (isSek ? 11.0 : 1.0)
  const roundingMode: 'round' | 'decimals' = syncSettings.roundingMode || (isSek ? 'round' : 'decimals')

  console.log(`Currency Settings: Currency=${targetCurrency}, Exchange Rate=${exchangeRate}, Rounding=${roundingMode}`)

  // Persist currency settings in metadata if not yet saved
  if (!syncSettings.targetCurrency || !syncSettings.exchangeRate) {
    const updatedMeta = {
      ...meta,
      productSync: {
        ...syncSettings,
        targetCurrency,
        exchangeRate,
        roundingMode
      }
    }
    await db
      .update(marketplaceIntegrations)
      .set({ metadata: updatedMeta, updatedAt: new Date() })
      .where(eq(marketplaceIntegrations.id, integrationId))
    console.log(`Saved updated currency settings to database metadata.`)
  }

  const convertCurrency = (val: number): number => {
    if (!exchangeRate || exchangeRate === 1.0) return Math.round(val * 100) / 100
    const converted = val * exchangeRate
    if (roundingMode === 'round') {
      return Math.round(converted)
    }
    return Math.round(converted * 100) / 100
  }

  // Fetch all mappings that have a reduced price in TheOmniStack
  const mappedItems = await db
    .select({
      mappingId: productMappings.id,
      marketplaceSku: productMappings.marketplaceSku,
      marketplaceProductId: productMappings.marketplaceProductId,
      sku: products.sku,
      price: products.price,
      msrp: products.msrp,
      reducedPrice: products.reducedPrice,
      saleStartDate: products.saleStartDate,
      saleEndDate: products.saleEndDate,
      stock: products.currentStock
    })
    .from(productMappings)
    .innerJoin(products, eq(productMappings.productId, products.id))
    .where(and(
      eq(productMappings.integrationId, integrationId),
      isNotNull(products.reducedPrice),
      gt(products.reducedPrice, '0')
    ))

  console.log(`Found ${mappedItems.length} products with Angebotspreise (reduced prices) in TheOmniStack.`)

  if (mappedItems.length === 0) {
    console.log(`No products with reduced prices to restore for ${shopName}.`)
    return
  }

  // Build the updates array
  const updates = mappedItems.map(item => {
    const rawPrice = item.price ? parseFloat(item.price) : undefined
    const rawMsrp = item.msrp ? parseFloat(item.msrp) : undefined
    const basePrice = (rawPrice && rawPrice > 0) ? rawPrice : (rawMsrp || 49.90)
    const redPrice = parseFloat(item.reducedPrice!)

    return {
      sku: item.marketplaceSku,
      marketplaceProductId: item.marketplaceProductId || undefined,
      price: convertCurrency(basePrice),
      reducedPrice: convertCurrency(redPrice),
      msrp: convertCurrency(rawMsrp || basePrice),
      saleStartDate: item.saleStartDate ? new Date(item.saleStartDate) : null,
      saleEndDate: item.saleEndDate ? new Date(item.saleEndDate) : null,
      stock: item.stock ? parseFloat(item.stock) : undefined
    }
  })

  // Log sample updates
  console.log("Sample updates being pushed:")
  updates.slice(0, 3).forEach(u => {
    console.log(`  SKU ${u.sku}: Price = ${u.price} ${targetCurrency}, Reduced = ${u.reducedPrice} ${targetCurrency}, MSRP = ${u.msrp} ${targetCurrency}`)
  })

  console.log(`Submitting ${updates.length} updates to ${shopName} via adapter.updateListings...`)
  await adapter.updateListings(integ.companyId, updates)

  console.log(`Successfully dispatched all price & discount updates to ${shopName}!`)
}

async function main() {
  const targetId = process.argv[2]

  if (targetId) {
    await restorePricesForIntegration(targetId)
  } else {
    // Look for all Secret Sales integrations
    const ints = await db.select().from(marketplaceIntegrations)
    const secretSalesIntegrations = ints.filter(i => {
      const meta = (i.metadata as any) || {}
      const name = (meta.customName || '').toLowerCase()
      return name.includes('secret')
    })

    console.log(`Found ${secretSalesIntegrations.length} Secret Sales integration(s).`)
    for (const integ of secretSalesIntegrations) {
      if (integ.id === 'c30bdf02-6456-4cdc-9776-a30d62fdf63c') continue // skip unconfigured placeholder
      await restorePricesForIntegration(integ.id)
    }
  }

  console.log('\nAll restoration tasks finished.')
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error during restoration:', err)
  process.exit(1)
})

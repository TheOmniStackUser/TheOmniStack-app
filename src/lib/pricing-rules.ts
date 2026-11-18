import type { MarketplaceSyncSettings, MarketplacePriceRule } from '@/app/actions/products'

export interface ChannelPriceRule {
  integrationId: string
  channel: string
  marketplace: string
  displayName: string
  isActive: boolean
  priceSyncEnabled: boolean
  stockSyncEnabled: boolean
  allowPreorder: boolean
  ruleType: 'none' | 'percentage' | 'fixed'
  value: number
  basePrice: 'standard' | 'reduced' | 'msrp' | 'all'
  roundingRule: 'decimals' | 'round'
  currency: string
  exchangeRate: number
  minPriceThreshold?: number | null
  maxPriceThreshold?: number | null
  additionalPriceRules?: MarketplacePriceRule[]
}

export interface ChannelPriceCalculation extends ChannelPriceRule {
  sku: string
  marketplaceSku?: string
  regularPrice: number
  reducedPrice: number | null
  msrp: number | null
  finalPrice: number
  basePriceUsed: 'standard' | 'reduced' | 'msrp' | 'all'
  rawBasePrice: number
  isDiscounted: boolean
  mappingModifierActive: boolean
  payload?: Record<string, any>
}

export function formatChannelDisplayName(integration: {
  type: string
  metadata?: any
}): { displayName: string; marketplace: string } {
  const meta = (integration.metadata as any) || {}
  const type = integration.type

  const fallbackNames: Record<string, string> = {
    otto: 'OTTO',
    mirakl_decathlon: 'Decathlon',
    mirakl_decathlon_eu: 'Decathlon EU',
    mirakl_mediamarkt: 'MediaMarkt',
    aboutyou: 'About You',
    amazon: 'Amazon',
    kaufland: 'Kaufland',
    ebay: 'eBay',
    etsy: 'Etsy',
    shopify: 'Shopify',
    woocommerce: 'WooCommerce',
    shopware: 'Shopware',
    mirakl_custom: 'Marktplatz',
  }

  // Detect shopify store name if available
  let shopifyName: string | null = null
  if (type === 'shopify') {
    const domain = meta?.myshopify_domain || meta?.shopDomain || meta?.domain || ''
    shopifyName = domain ? domain.replace('.myshopify.com', '') : meta?.name || null
  }

  const customName = meta?.customName?.trim()
  const displayName =
    (shopifyName ? `Shopify (${shopifyName})` : null) ||
    customName ||
    fallbackNames[type] ||
    type

  // Normalize canonical marketplace name
  let marketplace = type.toLowerCase()
  if (type === 'mirakl_custom') {
    const cn = (customName || '').toLowerCase()
    if (cn.includes('limango')) marketplace = 'limango'
    else if (cn.includes('secret') || cn.includes('secretsales')) marketplace = 'secretsales'
    else if (cn.includes('worten')) marketplace = 'worten'
    else if (cn.includes('decathlon')) marketplace = 'decathlon'
    else if (customName) marketplace = customName.toLowerCase().replace(/\s+/g, '_')
  } else if (type === 'mirakl_decathlon' || type === 'mirakl_decathlon_eu') {
    marketplace = 'decathlon'
  } else if (type === 'mirakl_mediamarkt') {
    marketplace = 'mediamarkt'
  }

  return { displayName, marketplace }
}

export function getChannelPriceRule(integration: {
  id: string
  type: string
  isActive: boolean
  metadata?: any
}): ChannelPriceRule {
  const { displayName, marketplace } = formatChannelDisplayName(integration)
  const meta = (integration.metadata as any) || {}
  const sync: MarketplaceSyncSettings = meta?.productSync || {}

  const isGlobalEnabled = sync.enabled !== false
  const priceSyncEnabled = Boolean(integration.isActive && isGlobalEnabled && sync.syncPrice)
  const stockSyncEnabled = Boolean(integration.isActive && isGlobalEnabled && sync.syncStock !== false)

  const isConversionEnabled =
    sync.enableCurrencyConversion !== undefined
      ? Boolean(sync.enableCurrencyConversion)
      : sync.targetCurrency
      ? sync.targetCurrency !== 'EUR'
      : false

  const currency = isConversionEnabled ? sync.targetCurrency || 'EUR' : 'EUR'
  const exchangeRate = isConversionEnabled && sync.exchangeRate && sync.exchangeRate > 0 ? Number(sync.exchangeRate) : 1.0
  const roundingRule: 'decimals' | 'round' = sync.roundingMode || (currency === 'SEK' ? 'round' : 'decimals')

  const additionalPriceRules: MarketplacePriceRule[] = Array.isArray(sync.additionalPriceRules)
    ? sync.additionalPriceRules.map((r) => ({
        id: r.id,
        priceModifierType: (r.priceModifierType as any) || 'none',
        priceModifierValue:
          r.priceModifierValue !== undefined && r.priceModifierValue !== null ? Number(r.priceModifierValue) : 0,
        priceBase: (r.priceBase as any) || 'standard',
        minPriceThreshold:
          r.minPriceThreshold !== undefined && r.minPriceThreshold !== null && (r.minPriceThreshold as any) !== ''
            ? Number(r.minPriceThreshold)
            : undefined,
        maxPriceThreshold:
          r.maxPriceThreshold !== undefined && r.maxPriceThreshold !== null && (r.maxPriceThreshold as any) !== ''
            ? Number(r.maxPriceThreshold)
            : undefined,
      }))
    : []

  return {
    integrationId: integration.id,
    channel: integration.type,
    marketplace,
    displayName,
    isActive: integration.isActive,
    priceSyncEnabled,
    stockSyncEnabled,
    allowPreorder: Boolean(sync.allowPreorder),
    ruleType: (sync.priceModifierType as any) || 'none',
    value: sync.priceModifierValue !== undefined && sync.priceModifierValue !== null ? Number(sync.priceModifierValue) : 0,
    basePrice: (sync.priceBase as any) || 'standard',
    roundingRule,
    currency,
    exchangeRate,
    minPriceThreshold:
      sync.minPriceThreshold !== undefined && sync.minPriceThreshold !== null && (sync.minPriceThreshold as any) !== ''
        ? Number(sync.minPriceThreshold)
        : null,
    maxPriceThreshold:
      sync.maxPriceThreshold !== undefined && sync.maxPriceThreshold !== null && (sync.maxPriceThreshold as any) !== ''
        ? Number(sync.maxPriceThreshold)
        : null,
    additionalPriceRules,
  }
}

export function doesPriceMatchRuleThresholds(
  price: number,
  minPriceThreshold?: number | null,
  maxPriceThreshold?: number | null
): boolean {
  if (minPriceThreshold !== undefined && minPriceThreshold !== null && minPriceThreshold > 0) {
    if (price < minPriceThreshold) return false
  }
  if (maxPriceThreshold !== undefined && maxPriceThreshold !== null && maxPriceThreshold > 0) {
    if (price >= maxPriceThreshold) return false
  }
  return true
}

export function applySingleRuleModifier(
  originalPrice: number,
  modifierType: 'none' | 'percentage' | 'fixed',
  modifierValue: number
): number {
  if (modifierType === 'none' || modifierValue === 0) return originalPrice
  let calculated = originalPrice
  if (modifierType === 'percentage') {
    calculated = originalPrice * (1 + modifierValue / 100)
  } else if (modifierType === 'fixed') {
    calculated = originalPrice + modifierValue
  }
  return Math.max(0, Math.round(calculated * 100) / 100)
}

export function evaluatePriceRulesForProduct(params: {
  rawPrice?: number
  rawReducedPrice?: number
  rawMsrp?: number
  primaryRule: MarketplacePriceRule
  additionalRules?: MarketplacePriceRule[]
  mappingOverride?: {
    priceModifierType?: 'none' | 'percentage' | 'fixed' | string | null
    priceModifierValue?: number | string | null
  } | null
}): {
  modifiedPrice: number | undefined
  modifiedReducedPrice: number | undefined
  rawBasePrice: number
  basePriceUsed: 'standard' | 'reduced' | 'msrp' | 'all'
  hasMappingModifier: boolean
} {
  const { rawPrice, rawReducedPrice, rawMsrp, primaryRule, additionalRules = [], mappingOverride } = params

  const hasMappingModifier = Boolean(
    mappingOverride?.priceModifierType && mappingOverride.priceModifierType !== 'none'
  )

  const rulesToEvaluate: MarketplacePriceRule[] = hasMappingModifier
    ? [
        {
          priceModifierType: mappingOverride!.priceModifierType as 'percentage' | 'fixed',
          priceModifierValue: Number(mappingOverride!.priceModifierValue || 0),
          priceBase: primaryRule.priceBase || 'standard',
          minPriceThreshold: primaryRule.minPriceThreshold,
          maxPriceThreshold: primaryRule.maxPriceThreshold,
        },
      ]
    : [primaryRule, ...additionalRules]

  const activeRules = rulesToEvaluate.filter(
    (r) => r.priceModifierType && r.priceModifierType !== 'none' && Number(r.priceModifierValue) !== 0
  )

  let modifiedPrice: number | undefined = rawPrice
  let modifiedReducedPrice: number | undefined = rawReducedPrice
  let rawBasePrice: number = rawPrice ?? 0
  let basePriceUsed: 'standard' | 'reduced' | 'msrp' | 'all' = (primaryRule.priceBase as any) || 'standard'

  // 1. Evaluate regular selling price (standard / msrp / all)
  const standardTargetRules = activeRules.filter((r) => {
    const base = r.priceBase || 'standard'
    return base === 'standard' || base === 'msrp' || base === 'all'
  })

  for (const r of standardTargetRules) {
    const base = r.priceBase || 'standard'
    const candidateVal =
      base === 'msrp'
        ? rawMsrp !== undefined && rawMsrp > 0
          ? rawMsrp
          : rawPrice
        : rawPrice

    if (candidateVal !== undefined && doesPriceMatchRuleThresholds(candidateVal, r.minPriceThreshold, r.maxPriceThreshold)) {
      modifiedPrice = applySingleRuleModifier(candidateVal, r.priceModifierType, Number(r.priceModifierValue))
      rawBasePrice = candidateVal
      basePriceUsed = base
      break
    }
  }

  // 2. Evaluate reduced promotional price (reduced / all)
  if (rawReducedPrice !== undefined) {
    if (rawReducedPrice > 0) {
      const reducedTargetRules = activeRules.filter((r) => {
        const base = r.priceBase || 'standard'
        return base === 'reduced' || base === 'all'
      })

      for (const r of reducedTargetRules) {
        if (doesPriceMatchRuleThresholds(rawReducedPrice, r.minPriceThreshold, r.maxPriceThreshold)) {
          modifiedReducedPrice = applySingleRuleModifier(
            rawReducedPrice,
            r.priceModifierType,
            Number(r.priceModifierValue)
          )
          rawBasePrice = rawReducedPrice
          basePriceUsed = (r.priceBase as any) || 'reduced'
          break
        }
      }
    } else if (rawReducedPrice === 0) {
      modifiedReducedPrice = 0
    }
  }

  return {
    modifiedPrice,
    modifiedReducedPrice,
    rawBasePrice,
    basePriceUsed,
    hasMappingModifier,
  }
}

export function calculateChannelPrice(params: {
  product: {
    sku: string
    price?: number | string | null
    reducedPrice?: number | string | null
    msrp?: number | string | null
  }
  integration: {
    id: string
    type: string
    isActive: boolean
    metadata?: any
  }
  mapping?: {
    marketplaceSku?: string | null
    marketplaceProductId?: string | null
    priceModifierType?: string | null
    priceModifierValue?: number | string | null
    syncPrice?: boolean | null
  } | null
}): ChannelPriceCalculation {
  const rule = getChannelPriceRule(params.integration)
  const product = params.product
  const mapping = params.mapping

  const rawPrice = product.price !== null && product.price !== undefined ? Number(product.price) : 0
  const rawReducedPrice =
    product.reducedPrice !== null && product.reducedPrice !== undefined && Number(product.reducedPrice) > 0
      ? Number(product.reducedPrice)
      : null
  const rawMsrp = product.msrp !== null && product.msrp !== undefined && Number(product.msrp) > 0 ? Number(product.msrp) : null

  const evaluated = evaluatePriceRulesForProduct({
    rawPrice,
    rawReducedPrice: rawReducedPrice ?? undefined,
    rawMsrp: rawMsrp ?? undefined,
    primaryRule: {
      priceModifierType: rule.ruleType,
      priceModifierValue: rule.value,
      priceBase: rule.basePrice,
      minPriceThreshold: rule.minPriceThreshold ?? undefined,
      maxPriceThreshold: rule.maxPriceThreshold ?? undefined,
    },
    additionalRules: rule.additionalPriceRules || [],
    mappingOverride: mapping,
  })

  const modifiedPrice = evaluated.modifiedPrice ?? rawPrice
  const modifiedReducedPrice = evaluated.modifiedReducedPrice !== undefined ? evaluated.modifiedReducedPrice : null
  const rawBasePrice = evaluated.rawBasePrice
  const hasMappingModifier = evaluated.hasMappingModifier

  // Apply currency conversion
  const convertCurrency = (val: number): number => {
    if (!rule.exchangeRate || rule.exchangeRate === 1.0) {
      return Math.round(val * 100) / 100
    }
    const converted = val * rule.exchangeRate
    if (rule.roundingRule === 'round') {
      return Math.round(converted)
    }
    return Math.round(converted * 100) / 100
  }

  const finalRegularPrice = convertCurrency(modifiedPrice)
  const finalReducedPrice = modifiedReducedPrice !== null ? convertCurrency(modifiedReducedPrice) : null
  const finalMsrp = rawMsrp !== null ? convertCurrency(rawMsrp) : null

  // The active final price customer pays on this channel
  const finalPrice =
    finalReducedPrice !== null && finalReducedPrice > 0 ? finalReducedPrice : finalRegularPrice

  const isKaufland = rule.marketplace === 'kaufland' || rule.channel === 'kaufland'
  const isAboutYou = rule.marketplace === 'aboutyou' || rule.channel === 'aboutyou'

  let payload: Record<string, any>
  if (isKaufland) {
    payload = {
      ...(mapping?.marketplaceProductId ? { id_unit: mapping.marketplaceProductId } : {}),
      listing_price: Math.round(finalPrice * 100),
    }
  } else if (isAboutYou) {
    payload = {
      sku: mapping?.marketplaceSku || product.sku,
      country_code: 'DE',
      currency: 'EUR',
      retail_price: finalRegularPrice,
      sale_price: finalReducedPrice !== null && finalReducedPrice > 0 ? finalReducedPrice : null,
    }
  } else {
    payload = {
      price: finalPrice,
      ...(finalReducedPrice !== null && finalReducedPrice > 0 ? { reducedPrice: finalReducedPrice } : {}),
    }
  }

  return {
    ...rule,
    sku: product.sku,
    marketplaceSku: mapping?.marketplaceSku || undefined,
    regularPrice: finalRegularPrice,
    reducedPrice: finalReducedPrice,
    msrp: finalMsrp,
    finalPrice,
    basePriceUsed: evaluated.basePriceUsed,
    rawBasePrice,
    isDiscounted: Boolean(finalReducedPrice !== null && finalReducedPrice > 0 && finalReducedPrice < finalRegularPrice),
    mappingModifierActive: hasMappingModifier,
    payload,
  }
}

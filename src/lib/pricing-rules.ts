import type { MarketplaceSyncSettings } from '@/app/actions/products'

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
    minPriceThreshold: sync.minPriceThreshold !== undefined && sync.minPriceThreshold !== null ? Number(sync.minPriceThreshold) : null,
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

  // Check mapping override: product-specific mapping modifier takes precedence if not 'none'
  const hasMappingModifier = Boolean(mapping?.priceModifierType && mapping.priceModifierType !== 'none')
  const modifierType: 'none' | 'percentage' | 'fixed' = hasMappingModifier
    ? (mapping!.priceModifierType as any)
    : rule.ruleType
  const modifierValue: number = hasMappingModifier
    ? Number(mapping!.priceModifierValue || 0)
    : rule.value

  const minThreshold = rule.minPriceThreshold !== undefined && rule.minPriceThreshold !== null ? rule.minPriceThreshold : undefined

  const applyModifier = (val: number): number => {
    if (modifierType === 'none' || modifierValue === 0) return val

    const isReduction = modifierValue < 0
    if (isReduction && minThreshold !== undefined && minThreshold > 0 && val < minThreshold) {
      return val
    }

    let calculated = val
    if (modifierType === 'percentage') {
      calculated = val * (1 + modifierValue / 100)
    } else if (modifierType === 'fixed') {
      calculated = val + modifierValue
    }

    if (isReduction && minThreshold !== undefined && minThreshold > 0 && calculated < minThreshold) {
      calculated = minThreshold
    }

    return Math.max(0, Math.round(calculated * 100) / 100)
  }

  let modifiedPrice: number = rawPrice
  let modifiedReducedPrice: number | null = rawReducedPrice
  let rawBasePrice: number = rawPrice

  if (rule.basePrice === 'msrp') {
    if (rawMsrp && rawMsrp > 0) {
      rawBasePrice = rawMsrp
      modifiedPrice = applyModifier(rawMsrp)
    } else {
      rawBasePrice = rawPrice
      modifiedPrice = applyModifier(rawPrice)
    }
    // Reduced price remains unshifted or unchanged
    modifiedReducedPrice = rawReducedPrice
  } else if (rule.basePrice === 'reduced') {
    modifiedPrice = rawPrice
    if (rawReducedPrice && rawReducedPrice > 0) {
      rawBasePrice = rawReducedPrice
      modifiedReducedPrice = applyModifier(rawReducedPrice)
    }
  } else if (rule.basePrice === 'all') {
    rawBasePrice = rawPrice
    modifiedPrice = applyModifier(rawPrice)
    if (rawReducedPrice && rawReducedPrice > 0) {
      modifiedReducedPrice = applyModifier(rawReducedPrice)
    }
  } else {
    // Default: 'standard'
    rawBasePrice = rawPrice
    modifiedPrice = applyModifier(rawPrice)
    modifiedReducedPrice = rawReducedPrice
  }

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

  return {
    ...rule,
    sku: product.sku,
    marketplaceSku: mapping?.marketplaceSku || undefined,
    regularPrice: finalRegularPrice,
    reducedPrice: finalReducedPrice,
    msrp: finalMsrp,
    finalPrice,
    basePriceUsed: rule.basePrice,
    rawBasePrice,
    isDiscounted: Boolean(finalReducedPrice !== null && finalReducedPrice > 0 && finalReducedPrice < finalRegularPrice),
    mappingModifierActive: hasMappingModifier,
  }
}

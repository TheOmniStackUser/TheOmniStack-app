export interface MarketplaceIntegrationLike {
  id?: string | null
  type?: string | null
  marketplace?: string | null
  environment?: string | null
  metadata?: unknown
}

/**
 * Extracts a human-readable store name from a Shopify integration.
 * Checks customName, shop metadata name, domain, and environment.
 */
export function getShopifyStoreName(
  integration: MarketplaceIntegrationLike | null | undefined
): string | null {
  if (!integration) return null

  const meta =
    integration.metadata && typeof integration.metadata === 'object'
      ? (integration.metadata as Record<string, unknown>)
      : {}
  const shop = typeof meta.shop === 'object' && meta.shop !== null ? (meta.shop as Record<string, unknown>) : null

  // 1. Explicit custom name
  if (typeof meta.customName === 'string' && meta.customName.trim()) {
    return meta.customName.trim()
  }

  // 2. Shop name from Shopify API (/admin/api/shop.json)
  if (shop && typeof shop.name === 'string' && shop.name.trim()) {
    return shop.name.trim()
  }

  // 3. Domain from shop metadata or integration environment
  const rawDomain =
    (shop && typeof shop.myshopify_domain === 'string' ? shop.myshopify_domain : null) ||
    (shop && typeof shop.domain === 'string' ? shop.domain : null) ||
    integration.environment

  if (rawDomain && typeof rawDomain === 'string' && rawDomain.trim()) {
    const cleaned = rawDomain
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .replace(/\.myshopify\.com$/i, '')
      .trim()

    const lower = cleaned.toLowerCase()
    if (cleaned && lower !== 'production' && lower !== 'sandbox') {
      return cleaned
    }
  }

  return null
}

/**
 * Formats a marketplace or integration into a clean display name.
 * If multiple Shopify integrations exist in `allIntegrations`, the store name
 * is included in parentheses: e.g. "Shopify (Sneakers DE)".
 */
export function formatMarketplaceName(
  integration: MarketplaceIntegrationLike | string | null | undefined,
  allIntegrations?: MarketplaceIntegrationLike[]
): string {
  if (!integration) return 'Unbekannt'

  // If passed as a plain string (e.g. 'shopify', 'amazon', 'otto')
  if (typeof integration === 'string') {
    const type = integration.toLowerCase().trim()
    const names: Record<string, string> = {
      amazon: 'Amazon',
      otto: 'Otto Market',
      shopify: 'Shopify',
      aboutyou: 'About You',
      kaufland: 'Kaufland',
      ebay: 'eBay',
      woocommerce: 'WooCommerce',
      shopware: 'Shopware',
      mirakl_decathlon: 'Decathlon',
      mirakl_decathlon_eu: 'Decathlon EU',
      mirakl_mediamarkt: 'MediaMarkt',
      mirakl_custom: 'Custom Mirakl',
      etsy: 'Etsy',
    }
    return names[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ') : 'Unbekannt')
  }

  const type = (integration.type || integration.marketplace || '').toLowerCase().trim()

  const meta =
    integration.metadata && typeof integration.metadata === 'object'
      ? (integration.metadata as Record<string, unknown>)
      : null
  const customName = typeof meta?.customName === 'string' && meta.customName.trim() ? meta.customName.trim() : null

  // Mirakl Custom Integration
  if (type === 'mirakl_custom' && customName) {
    return customName
  }

  // Shopify
  if (type === 'shopify') {
    const shopifyIntegrations = allIntegrations
      ? allIntegrations.filter(i => (i.type || i.marketplace || '').toLowerCase().trim() === 'shopify')
      : []

    const hasMultipleShopify = shopifyIntegrations.length > 1
    const storeName = getShopifyStoreName(integration)

    if (hasMultipleShopify && storeName) {
      return `Shopify (${storeName})`
    }

    if (hasMultipleShopify) {
      const fallback = integration.environment || integration.id?.slice(0, 6) || 'Shop'
      return `Shopify (${fallback})`
    }

    if (customName) {
      return `Shopify (${customName})`
    }

    return 'Shopify'
  }

  const names: Record<string, string> = {
    amazon: 'Amazon',
    otto: 'Otto Market',
    shopify: 'Shopify',
    aboutyou: 'About You',
    kaufland: 'Kaufland',
    ebay: 'eBay',
    woocommerce: 'WooCommerce',
    shopware: 'Shopware',
    mirakl_decathlon: 'Decathlon',
    mirakl_decathlon_eu: 'Decathlon EU',
    mirakl_mediamarkt: 'MediaMarkt',
    mirakl_custom: 'Custom Mirakl',
    etsy: 'Etsy',
  }

  return (
    names[type] ||
    (type ? type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ') : 'Unbekannt')
  )
}

/**
 * Resolves a marketplace display name by type and optional integrationId.
 * Looks up the full integration from the provided list if available.
 */
export function resolveMarketplaceDisplayName(
  type: string,
  integrationId: string | null | undefined,
  marketplaces: MarketplaceIntegrationLike[] = []
): string {
  if (integrationId) {
    const found = marketplaces.find(m => m.id === integrationId)
    if (found) {
      return formatMarketplaceName(found, marketplaces)
    }
  }

  return formatMarketplaceName(type, marketplaces)
}

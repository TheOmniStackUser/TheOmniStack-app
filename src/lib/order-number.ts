export type OrderLikeForDisplay = {
  id?: string | null
  marketplace?: string | null
  marketplaceOrderId?: string | null
  rawPayload?: unknown
}

/**
 * Returns the human-readable display order number for any marketplace / shop.
 *
 * For Shopify: e.g. '#10007' or '10007' (instead of the internal numeric ID like '12046991491337')
 * For Otto: e.g. 'cbn4yx425c' (instead of internal salesOrderId UUID)
 * For About You: e.g. 'ayou-139-393191527'
 * For WooCommerce: e.g. custom sequential number or order ID
 * For Shopware: e.g. '10023'
 * For Mirakl / Decathlon: e.g. '12345-A' / display_id
 * For Manual: e.g. custom order number or order ID
 */
export function getOrderDisplayNumber(order?: OrderLikeForDisplay | null): string {
  if (!order) return ''

  const raw = typeof order.rawPayload === 'string'
    ? (() => {
        try {
          return JSON.parse(order.rawPayload)
        } catch {
          return null
        }
      })()
    : (order.rawPayload as any)

  const mp = (order.marketplace || '').toLowerCase()

  // 1. Shopify
  if (mp === 'shopify') {
    if (raw?.name) return String(raw.name)
    if (raw?.order_number !== undefined && raw?.order_number !== null) return String(raw.order_number)
    if (raw?.orderNumber) return String(raw.orderNumber)
  }

  // 2. Otto
  if (mp === 'otto') {
    if (raw?.orderNumber) return String(raw.orderNumber)
    if (raw?.salesOrderId) return String(raw.salesOrderId)
  }

  // 3. About You
  if (mp === 'aboutyou') {
    if (raw?.order_number) return String(raw.order_number)
    if (raw?.orderNumber) return String(raw.orderNumber)
  }

  // 4. Shopware
  if (mp === 'shopware') {
    if (raw?.orderNumber) return String(raw.orderNumber)
  }

  // 5. WooCommerce
  if (mp === 'woocommerce') {
    if (raw?.number) return String(raw.number)
  }

  // 6. Mirakl
  if (mp.startsWith('mirakl')) {
    if (raw?.display_id) return String(raw.display_id)
  }

  // 7. Manual
  if (mp === 'manual') {
    if (raw?.manualMetadata?.orderNumber) return String(raw.manualMetadata.orderNumber)
    if (order.marketplaceOrderId && !order.marketplaceOrderId.startsWith('MAN-NO-ORDER-') && !order.marketplaceOrderId.startsWith('MAN-')) {
      return order.marketplaceOrderId
    }
  }

  // 8. General fallbacks on rawPayload
  if (raw?.orderNumber) return String(raw.orderNumber)
  if (raw?.name && typeof raw.name === 'string') return String(raw.name)
  if (raw?.order_number !== undefined && raw?.order_number !== null) return String(raw.order_number)

  // 9. Standard marketplaceOrderId
  if (order.marketplaceOrderId && !order.marketplaceOrderId.startsWith('MAN-NO-ORDER-')) {
    return order.marketplaceOrderId
  }

  return order.id || ''
}

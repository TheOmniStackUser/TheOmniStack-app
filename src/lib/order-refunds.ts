// ============================================================================
// ORDER REFUND UTILITIES
// Centralized calculations for order-level and item-level refund statuses.
// Prevents overcounting when orders have multiple items sharing the same SKU
// (e.g. About You / Scayle single-unit order lines, split orders, etc.).
// ============================================================================

export type OrderRefundStats = {
  totalOrderedQty: number
  totalRefundedQty: number
  isFullyRefunded: boolean
  isPartiallyRefunded: boolean
  refundedBySku: Record<string, number>
}

export type AllocatedOrderItem<T> = T & {
  allocatedRefund: number
  isFullyRefunded: boolean
  isPartiallyRefunded: boolean
  remainingQtyToRefund: number
}

/**
 * Calculates order-level refund metrics accurately by grouping quantities by SKU,
 * and capping refunded quantities at the total ordered quantity per SKU.
 */
export function calculateOrderRefundStats(
  items?: { sku?: string | null; quantity?: string | number | null }[] | null,
  returns?: { status?: string | null; metadata?: any }[] | null
): OrderRefundStats {
  let totalOrderedQty = 0
  const orderedBySku: Record<string, number> = {}

  if (items) {
    for (const item of items) {
      const qty = Number(item.quantity || 1)
      totalOrderedQty += qty
      const skuKey = (item.sku || '').toLowerCase().trim()
      orderedBySku[skuKey] = (orderedBySku[skuKey] || 0) + qty
    }
  }

  const refundedBySku: Record<string, number> = {}
  if (returns) {
    for (const ret of returns) {
      if (ret.status === 'bearbeitet' && ret.metadata?.refundedItems) {
        for (const r of ret.metadata.refundedItems as any[]) {
          const skuKey = (r.sku || '').toLowerCase().trim()
          if (skuKey) {
            refundedBySku[skuKey] = (refundedBySku[skuKey] || 0) + (Number(r.quantity) || 0)
          }
        }
      }
    }
  }

  let totalRefundedQty = 0
  for (const [skuKey, refundedQty] of Object.entries(refundedBySku)) {
    const orderedQty = orderedBySku[skuKey] || 0
    totalRefundedQty += Math.min(refundedQty, orderedQty)
  }

  return {
    totalOrderedQty,
    totalRefundedQty,
    isFullyRefunded: totalOrderedQty > 0 && totalRefundedQty >= totalOrderedQty,
    isPartiallyRefunded: totalRefundedQty > 0 && totalRefundedQty < totalOrderedQty,
    refundedBySku,
  }
}

/**
 * Sequentially allocates available refunded quantities across individual order items sharing the same SKU.
 * This ensures that if 1 of 2 identical items was refunded, exactly one is marked as refunded
 * and the other remains active / refundable.
 */
export function allocateRefundsToOrderItems<T extends { sku?: string | null; quantity?: string | number | null }>(
  items: T[],
  refundedBySku: Record<string, number>
): AllocatedOrderItem<T>[] {
  const remainingRefunds: Record<string, number> = { ...refundedBySku }

  return items.map((item) => {
    const skuKey = (item.sku || '').toLowerCase().trim()
    const itemQty = Number(item.quantity || 1)
    const available = remainingRefunds[skuKey] || 0
    const allocated = Math.min(itemQty, available)
    remainingRefunds[skuKey] = Math.max(0, available - allocated)

    return {
      ...item,
      allocatedRefund: allocated,
      isFullyRefunded: allocated >= itemQty && itemQty > 0,
      isPartiallyRefunded: allocated > 0 && allocated < itemQty,
      remainingQtyToRefund: Math.max(0, itemQty - allocated),
    }
  })
}

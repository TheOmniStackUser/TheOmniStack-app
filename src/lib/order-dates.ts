export interface MarketplaceItemDateInfo {
  sku?: string
  title?: string
  expectedDeliveryDate?: Date | null
  expectedShipmentDate?: Date | null
  fulfillmentStatus?: string
  isPreOrder: boolean
}

export interface MarketplaceShippingInfo {
  /** The primary target date to display */
  targetDate: Date | null
  /** Type of date: delivery date, shipment deadline, or manual scheduled date */
  dateType: 'delivery' | 'shipment' | 'manual_scheduled' | 'none'
  /** Human-readable label in German, e.g. 'Lieferung bis', 'Versandfrist', 'Vorbestellung' */
  label: string
  /** Whether the order qualifies as a Vorbestellung (pre-order / extended fulfillment) */
  isPreOrder: boolean
  /** Difference in days between purchaseDate and targetDate */
  diffDays: number | null
  /** Whether the targetDate is in the past for an unshipped order */
  isOverdue: boolean
  /** Item-level dates if available (e.g. Otto position items) */
  itemDates: MarketplaceItemDateInfo[]
}

interface GenericMarketplacePayload {
  positionItems?: Array<{
    expectedDeliveryDate?: string | null
    processableDate?: string | null
    expectedShipmentDate?: string | null
    fulfillmentStatus?: string | null
    product?: {
      sku?: string | null
      articleNumber?: string | null
      productTitle?: string | null
    } | null
  }>
  rawOrder?: {
    LatestShipDate?: string | null
    LatestDeliveryDate?: string | null
    EarliestShipDate?: string | null
  }
  LatestShipDate?: string | null
  LatestDeliveryDate?: string | null
  EarliestShipDate?: string | null
  shipping_deadline?: string | null
  order_lines?: Array<{
    shipping_deadline?: string | null
  }>
  lineItems?: Array<{
    lineItemFulfillmentInstructions?: {
      shipByDate?: string | null
    }
  }>
  fulfillmentStartInstructions?: Array<{
    maxEstimatedDeliveryDate?: string | null
  }>
  order_units?: Array<{
    delivery_time_expires_iso?: string | null
  }>
  transactions?: Array<{
    expected_ship_date?: string | number | null
  }>
  [key: string]: unknown
}

const PREORDER_DAYS_THRESHOLD = 10 // Standard delivery windows spanning weekends can reach 5-7 days; 10+ days implies pre-order / extended lead time

function parseDateSafe(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val
  if (typeof val === 'number') {
    // If it's in seconds (like Etsy epoch ~ 1.7e9), convert to ms
    const ms = val < 10000000000 ? val * 1000 : val
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof val === 'string') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

export function getMarketplaceShippingInfo(order: {
  marketplace?: string | null
  marketplacePurchaseDate?: Date | string | null
  createdAt?: Date | string | null
  status?: string | null
  scheduledShipmentDate?: Date | string | null
  rawPayload?: unknown
}): MarketplaceShippingInfo {
  let raw: GenericMarketplacePayload = {}
  if (typeof order.rawPayload === 'string') {
    try {
      raw = (JSON.parse(order.rawPayload) || {}) as GenericMarketplacePayload
    } catch {
      raw = {}
    }
  } else if (order.rawPayload && typeof order.rawPayload === 'object') {
    raw = order.rawPayload as GenericMarketplacePayload
  }

  const purchaseDate = parseDateSafe(order.marketplacePurchaseDate) || parseDateSafe(order.createdAt) || new Date()
  const mp = (order.marketplace || '').toLowerCase()
  const isShipped = order.status === 'shipped'
  const isLaterShipment = order.status === 'later_shipment'

  let targetDate: Date | null = null
  let dateType: 'delivery' | 'shipment' | 'manual_scheduled' | 'none' = 'none'
  let label = ''
  let isPreOrder = false
  const itemDates: MarketplaceItemDateInfo[] = []

  // Check manual scheduled shipment date first if status is later_shipment
  const manualDate = parseDateSafe(order.scheduledShipmentDate)
  if (isLaterShipment && manualDate) {
    targetDate = manualDate
    dateType = 'manual_scheduled'
    label = 'Geplanter Versand'
  }

  // 1. OTTO
  if (mp === 'otto' || Array.isArray(raw?.positionItems)) {
    const items = Array.isArray(raw?.positionItems) ? raw.positionItems : []
    let maxDeliveryDate: Date | null = null
    let hasAnnouncedItem = false

    for (const item of items) {
      const itemDelivery = parseDateSafe(item.expectedDeliveryDate)
      const itemShipment = parseDateSafe(item.processableDate || item.expectedShipmentDate)
      const status = item.fulfillmentStatus || ''
      const isItemAnnounced = status === 'ANNOUNCED'
      if (isItemAnnounced) hasAnnouncedItem = true

      let itemDiffDays: number | null = null
      let itemIsPreOrder = isItemAnnounced

      if (itemDelivery) {
        itemDiffDays = Math.round((itemDelivery.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24))
        if (itemDiffDays >= PREORDER_DAYS_THRESHOLD) {
          itemIsPreOrder = true
        }
        if (!maxDeliveryDate || itemDelivery > maxDeliveryDate) {
          maxDeliveryDate = itemDelivery
        }
      }

      itemDates.push({
        sku: item.product?.sku || item.product?.articleNumber || '',
        title: item.product?.productTitle || '',
        expectedDeliveryDate: itemDelivery,
        expectedShipmentDate: itemShipment,
        fulfillmentStatus: status,
        isPreOrder: itemIsPreOrder,
      })
    }

    if (!targetDate && maxDeliveryDate) {
      targetDate = maxDeliveryDate
      dateType = 'delivery'
    }

    if (hasAnnouncedItem || itemDates.some(i => i.isPreOrder)) {
      isPreOrder = true
    }
  }

  // 2. AMAZON
  else if (mp === 'amazon' || raw?.LatestShipDate || raw?.rawOrder?.LatestShipDate) {
    const rawOrder = raw?.rawOrder || raw
    const latestShip = parseDateSafe(rawOrder.LatestShipDate)
    const latestDelivery = parseDateSafe(rawOrder.LatestDeliveryDate)
    const earliestShip = parseDateSafe(rawOrder.EarliestShipDate)

    if (!targetDate) {
      if (latestShip) {
        targetDate = latestShip
        dateType = 'shipment'
      } else if (latestDelivery) {
        targetDate = latestDelivery
        dateType = 'delivery'
      } else if (earliestShip) {
        targetDate = earliestShip
        dateType = 'shipment'
      }
    }
  }

  // 3. MIRAKL (Decathlon, Shop-Apotheke, Limango, Secret Sales, MediaMarkt, etc.)
  else if (raw?.shipping_deadline || raw?.order_lines?.[0]?.shipping_deadline || mp.includes('mirakl') || mp.includes('decathlon')) {
    const deadline = parseDateSafe(raw?.shipping_deadline || raw?.order_lines?.[0]?.shipping_deadline)
    if (!targetDate && deadline) {
      targetDate = deadline
      dateType = 'shipment'
    }
  }

  // 4. EBAY
  else if (mp === 'ebay' || raw?.lineItems?.[0]?.lineItemFulfillmentInstructions || raw?.fulfillmentStartInstructions) {
    const lineShipBy = parseDateSafe(raw?.lineItems?.[0]?.lineItemFulfillmentInstructions?.shipByDate)
    const maxDelivery = parseDateSafe(raw?.fulfillmentStartInstructions?.[0]?.maxEstimatedDeliveryDate)

    if (!targetDate) {
      if (lineShipBy) {
        targetDate = lineShipBy
        dateType = 'shipment'
      } else if (maxDelivery) {
        targetDate = maxDelivery
        dateType = 'delivery'
      }
    }
  }

  // 5. KAUFLAND
  else if (mp === 'kaufland' || (raw as Record<string, unknown>)?.[0] || raw?.order_units?.[0]?.delivery_time_expires_iso) {
    const firstElement = (Array.isArray(raw) ? raw[0] : (raw as Record<string, unknown>)?.[0]) as { delivery_time_expires_iso?: string | null } | undefined
    const expires = parseDateSafe(firstElement?.delivery_time_expires_iso || raw?.order_units?.[0]?.delivery_time_expires_iso)
    if (!targetDate && expires) {
      targetDate = expires
      dateType = 'shipment'
    }
  }

  // 6. ETSY
  else if (mp === 'etsy' || raw?.transactions?.[0]?.expected_ship_date) {
    const shipDate = parseDateSafe(raw?.transactions?.[0]?.expected_ship_date)
    if (!targetDate && shipDate) {
      targetDate = shipDate
      dateType = 'shipment'
    }
  }

  // Fallback to manual date if set
  if (!targetDate && manualDate) {
    targetDate = manualDate
    dateType = 'manual_scheduled'
  }

  // Calculate diff days & pre-order detection
  let diffDays: number | null = null
  if (targetDate) {
    diffDays = Math.round((targetDate.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays >= PREORDER_DAYS_THRESHOLD) {
      isPreOrder = true
    }
  }

  if (isLaterShipment) {
    isPreOrder = true
  }

  // Determine user-friendly label
  if (isPreOrder) {
    label = 'Vorbestellung'
  } else if (dateType === 'delivery') {
    label = 'Lieferung bis'
  } else if (dateType === 'shipment') {
    label = 'Versandfrist'
  } else if (dateType === 'manual_scheduled') {
    label = 'Geplanter Versand'
  } else {
    label = 'Versanddatum'
  }

  // Overdue check (only for unshipped, non-cancelled orders)
  let isOverdue = false
  if (targetDate && !isShipped && order.status !== 'cancelled') {
    // If target date is before today (comparing start of day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const compareDate = new Date(targetDate)
    compareDate.setHours(23, 59, 59, 999)
    if (compareDate < today) {
      isOverdue = true
    }
  }

  return {
    targetDate,
    dateType,
    label,
    isPreOrder,
    diffDays,
    isOverdue,
    itemDates,
  }
}

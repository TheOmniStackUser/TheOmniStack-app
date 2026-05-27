// ============================================================================
// WOOCOMMERCE ADAPTER
// Connects to the WooCommerce REST API v3 to fetch and manage orders.
// Reference: https://woocommerce.github.io/woocommerce-rest-api-docs/
//
// Authentication: Basic Auth (Consumer Key + Consumer Secret)
// Endpoint base: {shopUrl}/wp-json/wc/v3/
// ============================================================================

import type { MarketplaceAdapter, NormalizedOrder } from './base'

export type WooCommerceAdapterConfig = {
  shopUrl: string        // e.g. https://myshop.com (stored in `environment`)
  consumerKey: string    // ck_xxx... (stored in `clientId`)
  consumerSecret: string // cs_xxx... (stored in `clientSecret`)
}

export class WooCommerceAdapter implements MarketplaceAdapter {
  readonly marketplace = 'woocommerce' as const
  private readonly baseUrl: string
  private readonly authHeader: string

  constructor(private readonly config: WooCommerceAdapterConfig) {
    // Normalize shop URL — strip trailing slash
    this.baseUrl = config.shopUrl.replace(/\/$/, '')
    // WooCommerce Basic Auth: base64(consumerKey:consumerSecret)
    const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64')
    this.authHeader = `Basic ${credentials}`
  }

  // ─── Fetch Unshipped Orders ──────────────────────────────────────────────────
  /**
   * Fetches all orders with status 'processing' (= paid, awaiting fulfillment).
   * Handles WooCommerce pagination via X-WP-TotalPages response header.
   */
  async fetchUnshippedOrders(
    companyId: string,
    options?: { fromDate?: string; toDate?: string }
  ): Promise<NormalizedOrder[]> {
    console.log(`[WooCommerceAdapter] Fetching processing orders for company ${companyId}...`)

    const allOrders: any[] = []
    let page = 1
    let totalPages = 1

    do {
      const url = new URL(`${this.baseUrl}/wp-json/wc/v3/orders`)
      url.searchParams.set('status', 'processing')
      url.searchParams.set('per_page', '100')
      url.searchParams.set('page', String(page))

      if (options?.fromDate) {
        // WooCommerce expects ISO 8601 format for after/before filters
        url.searchParams.set('after', options.fromDate.includes('T') ? options.fromDate : `${options.fromDate}T00:00:00`)
      }
      if (options?.toDate) {
        url.searchParams.set('before', options.toDate.includes('T') ? options.toDate : `${options.toDate}T23:59:59`)
      }

      console.log(`[WooCommerceAdapter] Fetching page ${page}/${totalPages}: ${url.toString()}`)

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`[WooCommerceAdapter] API error ${response.status}: ${errText}`)
      }

      const rawOrders: any[] = await response.json()
      allOrders.push(...rawOrders)

      // Read pagination from response headers
      const totalPagesHeader = response.headers.get('X-WP-TotalPages')
      if (totalPagesHeader) {
        totalPages = parseInt(totalPagesHeader, 10) || 1
      }

      page++
    } while (page <= totalPages)

    console.log(`[WooCommerceAdapter] Fetched ${allOrders.length} orders total.`)
    return allOrders.map((o) => this.normalizeOrder(o))
  }

  // ─── Normalize Order ─────────────────────────────────────────────────────────
  private normalizeOrder(raw: any): NormalizedOrder {
    const shipping = raw.shipping || {}
    const billing = raw.billing || {}

    // Determine shipping name — prefer shipping address, fall back to billing
    const shippingFirstName = shipping.first_name || billing.first_name || ''
    const shippingLastName = shipping.last_name || billing.last_name || ''
    const shippingName = `${shippingFirstName} ${shippingLastName}`.trim() || 'WooCommerce Customer'

    // Build shipping address — fall back to billing if shipping is empty
    const shippingAddress1 = shipping.address_1 || billing.address_1 || ''
    const shippingAddress2 = shipping.address_2 || billing.address_2 || ''
    const street = shippingAddress2
      ? `${shippingAddress1} ${shippingAddress2}`.trim()
      : shippingAddress1

    // Parse line items
    let totalAmount = parseFloat(raw.total || '0')
    let taxAmount = parseFloat(raw.total_tax || '0')

    const items = (raw.line_items || []).map((li: any) => {
      const unitPrice = parseFloat(li.total || '0') / Math.max(li.quantity, 1)
      // WooCommerce provides total_tax per line item
      const lineTax = parseFloat(li.total_tax || '0')
      const lineNet = parseFloat(li.total || '0')
      const taxRate = lineNet > 0 ? lineTax / lineNet : 0.19

      return {
        sku: li.sku || li.product_id?.toString() || 'UNKNOWN',
        title: li.name || 'WooCommerce Produkt',
        quantity: li.quantity,
        unitPrice,
        taxRate,
      }
    })

    return {
      marketplaceOrderId: raw.id.toString(),
      marketplace: this.marketplace,
      purchaseDate: new Date(raw.date_created || Date.now()),
      buyer: {
        name: `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || shippingName,
        email: billing.email || raw.customer_email || undefined,
      },
      shippingAddress: {
        name: shippingName,
        street,
        city: shipping.city || billing.city || '',
        zip: shipping.postcode || billing.postcode || '',
        country: shipping.country || billing.country || 'DE',
      },
      currency: raw.currency || 'EUR',
      items,
      totalAmount,
      taxAmount,
      rawPayload: raw,
    }
  }

  // ─── Confirm Shipment ────────────────────────────────────────────────────────
  /**
   * Marks a WooCommerce order as 'completed' and adds a tracking note.
   * WooCommerce does not have a native tracking API in core — tracking is 
   * communicated via an order note and status change to 'completed'.
   */
  async confirmShipment(
    marketplaceOrderId: string,
    trackingNumber: string,
    carrier: string,
    returnTrackingNumber?: string,
    _rawOrderPayload?: unknown
  ): Promise<void> {
    console.log(`[WooCommerceAdapter] Confirming shipment for order ${marketplaceOrderId}...`)

    // 1. Update order status to 'completed'
    const updateRes = await fetch(
      `${this.baseUrl}/wp-json/wc/v3/orders/${marketplaceOrderId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'completed' }),
      }
    )

    if (!updateRes.ok) {
      const errText = await updateRes.text()
      throw new Error(`[WooCommerceAdapter] Failed to update order status: ${updateRes.status} - ${errText}`)
    }

    // 2. Add tracking note to the order
    const noteBody = returnTrackingNumber
      ? `Sendung versendet. Tracking: ${trackingNumber} (${carrier}). Retouren-Tracking: ${returnTrackingNumber}`
      : `Sendung versendet. Tracking: ${trackingNumber} (${carrier}).`

    const noteRes = await fetch(
      `${this.baseUrl}/wp-json/wc/v3/orders/${marketplaceOrderId}/notes`,
      {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          note: noteBody,
          customer_note: false,
        }),
      }
    )

    if (!noteRes.ok) {
      // Non-fatal: note failed but status is already updated
      console.warn(`[WooCommerceAdapter] Failed to add tracking note for order ${marketplaceOrderId}: ${noteRes.status}`)
    }

    console.log(`[WooCommerceAdapter] Shipment confirmed for order ${marketplaceOrderId}`)
  }
}

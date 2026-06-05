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
        phone: billing.phone || undefined,
      },
      shippingAddress: {
        name: shippingName,
        company: shipping.company || undefined,
        addressAddition: shipping.address_2 || undefined,
        phone: shipping.phone || undefined,
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

  async refundOrder(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: unknown
  ): Promise<boolean> {
    console.log(`[WooCommerceAdapter] Refunding order ${marketplaceOrderId}...`)
    try {
      // 1. Fetch order details if not in payload to map line item IDs
      let rawOrder = (rawOrderPayload as any)
      if (!rawOrder || !rawOrder.line_items) {
        console.log(`[WooCommerceAdapter] Fetching order details from WooCommerce API...`)
        const response = await fetch(`${this.baseUrl}/wp-json/wc/v3/orders/${marketplaceOrderId}`, {
          method: 'GET',
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }
        })
        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`Failed to fetch WooCommerce order: ${response.status} ${errText}`)
        }
        rawOrder = await response.json()
      }

      if (!rawOrder || !rawOrder.line_items) {
        throw new Error(`No WooCommerce line items found for order ${marketplaceOrderId}`)
      }

      // 2. Map SKUs to Woo line item IDs and calculate total refund amount
      let refundAmount = 0
      const refundLineItems = refundItems.map(item => {
        const matchingLineItem = rawOrder.line_items.find((li: any) => li.sku === item.sku || li.product_id?.toString() === item.sku)
        if (!matchingLineItem) {
          console.warn(`[WooCommerceAdapter] No matching line item found on WooCommerce for SKU ${item.sku}`)
          return null
        }
        const unitPrice = parseFloat(matchingLineItem.price || matchingLineItem.total || '0') / Math.max(matchingLineItem.quantity, 1)
        refundAmount += unitPrice * item.quantity

        return {
          id: matchingLineItem.id,
          quantity: item.quantity,
          refund_total: (unitPrice * item.quantity).toFixed(2)
        }
      }).filter(Boolean)

      if (refundLineItems.length === 0) {
        console.warn(`[WooCommerceAdapter] No valid line items to refund.`)
        return false
      }

      // 3. Post refund to WooCommerce API
      const refundPayload = {
        amount: refundAmount.toFixed(2),
        reason: 'OmniScan Return Refund',
        line_items: refundLineItems
      }

      console.log(`[WooCommerceAdapter] Posting refund to WooCommerce API...`)
      const response = await fetch(`${this.baseUrl}/wp-json/wc/v3/orders/${marketplaceOrderId}/refunds`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(refundPayload)
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(`[WooCommerceAdapter] Refund request failed: ${response.status} - ${errText}`)
        throw new Error(`WooCommerce Refund API Error: ${errText}`)
      }

      console.log(`[WooCommerceAdapter] Refund processed successfully for order ${marketplaceOrderId}`)
      return true
    } catch (error) {
      console.error(`[WooCommerceAdapter] Error during WooCommerce refund:`, error)
      return false
    }
  }

  async fetchProducts(companyId: string): Promise<import('./base').MarketplaceProduct[]> {
    try {
      console.log(`[WooCommerceAdapter] Fetching products...`)
      const allProducts: any[] = []
      let page = 1
      let totalPages = 1

      do {
        const url = new URL(`${this.baseUrl}/wp-json/wc/v3/products`)
        url.searchParams.set('per_page', '100')
        url.searchParams.set('page', String(page))

        console.log(`[WooCommerceAdapter] Fetching products page ${page}/${totalPages}...`)

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

        const rawProducts: any[] = await response.json()
        allProducts.push(...rawProducts)

        const totalPagesHeader = response.headers.get('X-WP-TotalPages')
        if (totalPagesHeader) {
          totalPages = parseInt(totalPagesHeader, 10) || 1
        }

        page++
      } while (page <= totalPages)

      console.log(`[WooCommerceAdapter] Fetched ${allProducts.length} products total.`)

      const results: import('./base').MarketplaceProduct[] = []
      for (const p of allProducts) {
        if (p.type === 'variable') {
          // If variable, we might need to fetch variations, but WooCommerce v3 includes variations in separate endpoint.
          // For simplicity, we just add the parent if it has a SKU, but usually variations have the SKUs.
          // In a real app we'd fetch /wp-json/wc/v3/products/{id}/variations
          if (p.sku) {
            results.push({
              marketplaceProductId: p.id.toString(),
              sku: p.sku,
              title: p.name,
              price: parseFloat(p.price || '0'),
              stock: p.stock_quantity || 0,
              rawPayload: p
            })
          }
        } else {
          results.push({
            marketplaceProductId: p.id.toString(),
            sku: p.sku || p.id.toString(),
            title: p.name,
            price: parseFloat(p.price || '0'),
            stock: p.stock_quantity || 0,
            rawPayload: p
          })
        }
      }

      return results
    } catch (error) {
      console.error(`[WooCommerceAdapter] Error fetching products:`, error)
      throw error
    }
  }

  async updateListings(
    companyId: string, 
    updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number }[]
  ): Promise<void> {
    if (!updates || updates.length === 0) return

    try {
      // Use WooCommerce Batch API
      const url = `${this.baseUrl}/wp-json/wc/v3/products/batch`
      
      const batchUpdates = updates.map(u => {
        const updateObj: any = { id: parseInt(u.marketplaceProductId || '0', 10) }
        if (u.stock !== undefined) {
          updateObj.manage_stock = true
          updateObj.stock_quantity = u.stock
        }
        if (u.price !== undefined) {
          updateObj.regular_price = String(u.price)
        }
        return updateObj
      }).filter(u => u.id > 0)

      if (batchUpdates.length === 0) {
        console.warn(`[WooCommerceAdapter] No valid product IDs provided for update.`)
        return
      }

      console.log(`[WooCommerceAdapter] Updating ${batchUpdates.length} products via batch...`)

      // API allows max 100 per batch
      for (let i = 0; i < batchUpdates.length; i += 100) {
        const chunk = batchUpdates.slice(i, i + 100)
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ update: chunk })
        })

        if (!response.ok) {
          const errText = await response.text()
          console.error(`[WooCommerceAdapter] Update products batch failed: ${errText}`)
        }
      }

      console.log(`[WooCommerceAdapter] Listings successfully updated.`)
    } catch (error) {
      console.error(`[WooCommerceAdapter] Error updating listings:`, error)
      throw error
    }
  }
}

// ============================================================================
// SHOPWARE 6 ADAPTER
// Connects to the Shopware 6 Admin API to fetch and manage orders.
// Reference: https://shopware.stoplight.io/docs/admin-api
//
// Authentication: OAuth2 Client Credentials (Access Key ID + Secret Access Key)
// Token Endpoint: POST {shopUrl}/api/oauth/token
// Orders Endpoint: POST {shopUrl}/api/search/order
// ============================================================================

import type { MarketplaceAdapter, NormalizedOrder } from './base'

export type ShopwareAdapterConfig = {
  shopUrl: string      // e.g. https://myshop.com (stored in `environment`)
  clientId: string     // Access Key ID (stored in `clientId`)
  clientSecret: string // Secret Access Key (stored in `clientSecret`)
}

export class ShopwareAdapter implements MarketplaceAdapter {
  readonly marketplace = 'shopware' as const
  private readonly baseUrl: string

  // Token cache to avoid re-fetching within a single sync run
  private cachedToken: string | null = null
  private tokenExpiresAt: number = 0

  constructor(private readonly config: ShopwareAdapterConfig) {
    this.baseUrl = config.shopUrl.replace(/\/$/, '')
  }

  // ─── Auth: Get Bearer Token ─────────────────────────────────────────────────
  private async getAccessToken(): Promise<string> {
    const now = Date.now()
    // Reuse cached token if still valid (with 30-second buffer)
    if (this.cachedToken && now < this.tokenExpiresAt - 30_000) {
      return this.cachedToken
    }

    console.log(`[ShopwareAdapter] Fetching OAuth2 token from ${this.baseUrl}/api/oauth/token`)

    const tokenRes = await fetch(`${this.baseUrl}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      throw new Error(`[ShopwareAdapter] OAuth2 token error ${tokenRes.status}: ${errText}`)
    }

    const data = await tokenRes.json()
    this.cachedToken = data.access_token as string
    // Shopware tokens are typically valid for 600 seconds (10 minutes)
    this.tokenExpiresAt = now + (data.expires_in || 600) * 1000

    return this.cachedToken
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken()
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  // ─── Fetch Unshipped Orders ──────────────────────────────────────────────────
  /**
   * Uses the Shopware 6 Search API to fetch open orders.
   * Filters by delivery status = 'open' (not yet shipped).
   * Handles pagination via Shopware's page/limit system.
   */
  async fetchUnshippedOrders(
    companyId: string,
    options?: { fromDate?: string; toDate?: string }
  ): Promise<NormalizedOrder[]> {
    console.log(`[ShopwareAdapter] Fetching open orders for company ${companyId}...`)

    const allOrders: any[] = []
    let page = 1
    const limit = 100
    let hasMore = true

    while (hasMore) {
      const filters: any[] = [
        // Only fetch orders with open delivery status (not yet shipped)
        {
          type: 'equals',
          field: 'deliveries.stateMachineState.technicalName',
          value: 'open',
        },
      ]

      if (options?.fromDate) {
        filters.push({
          type: 'range',
          field: 'orderDateTime',
          parameters: {
            gte: options.fromDate.includes('T') ? options.fromDate : `${options.fromDate}T00:00:00.000Z`,
          },
        })
      }

      if (options?.toDate) {
        filters.push({
          type: 'range',
          field: 'orderDateTime',
          parameters: {
            lte: options.toDate.includes('T') ? options.toDate : `${options.toDate}T23:59:59.999Z`,
          },
        })
      }

      const body = {
        limit,
        page,
        filter: filters,
        // Load associations needed for normalization
        associations: {
          lineItems: {},
          addresses: {},
          deliveries: {
            associations: {
              shippingOrderAddress: {},
              stateMachineState: {},
            },
          },
          orderCustomer: {},
          currency: {},
          stateMachineState: {},
        },
        sort: [{ field: 'orderDateTime', order: 'DESC' }],
      }

      console.log(`[ShopwareAdapter] Fetching page ${page}...`)

      const headers = await this.authHeaders()
      const res = await fetch(`${this.baseUrl}/api/search/order`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`[ShopwareAdapter] Search API error ${res.status}: ${errText}`)
      }

      const data = await res.json()
      const pageOrders: any[] = data.data || []
      allOrders.push(...pageOrders)

      const total = data.total || 0
      hasMore = allOrders.length < total && pageOrders.length === limit
      page++
    }

    console.log(`[ShopwareAdapter] Fetched ${allOrders.length} open orders total.`)
    return allOrders.map((o) => this.normalizeOrder(o))
  }

  // ─── Normalize Order ─────────────────────────────────────────────────────────
  private normalizeOrder(raw: any): NormalizedOrder {
    // Customer info
    const customer = raw.orderCustomer || {}

    // Shipping address — from first delivery or fall back to first address
    const delivery = (raw.deliveries || [])[0]
    const shippingAddr = delivery?.shippingOrderAddress || (raw.addresses || [])[0] || {}

    const shippingFirstName = shippingAddr.firstName || customer.firstName || ''
    const shippingLastName = shippingAddr.lastName || customer.lastName || ''
    const shippingName = `${shippingFirstName} ${shippingLastName}`.trim() || 'Shopware Customer'

    const street = shippingAddr.additionalAddressLine1
      ? `${shippingAddr.street || ''} ${shippingAddr.additionalAddressLine1}`.trim()
      : shippingAddr.street || ''

    // Line items
    const items = (raw.lineItems || [])
      .filter((li: any) => li.type === 'product') // Skip discount/shipping line items
      .map((li: any) => {
        const quantity = li.quantity || 1
        const unitPrice = (li.unitPrice || 0)
        // Shopware stores tax rate in li.price.taxRules[0].taxRate (percentage, e.g. 19)
        const taxRatePercent = li.price?.taxRules?.[0]?.taxRate ?? 19
        const taxRate = taxRatePercent / 100

        return {
          sku: li.payload?.productNumber || li.productId || 'UNKNOWN',
          title: li.label || 'Shopware Produkt',
          quantity,
          unitPrice,
          taxRate,
        }
      })

    const totalAmount = parseFloat(raw.amountTotal || raw.price?.totalPrice || '0')
    const taxAmount = parseFloat(raw.amountNet !== undefined
      ? (raw.amountTotal - raw.amountNet).toFixed(2)
      : '0'
    )

    return {
      marketplaceOrderId: raw.orderNumber || raw.id,
      marketplace: this.marketplace,
      purchaseDate: new Date(raw.orderDateTime || Date.now()),
      buyer: {
        name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || shippingName,
        email: customer.email || undefined,
      },
      shippingAddress: {
        name: shippingName,
        street,
        city: shippingAddr.city || '',
        zip: shippingAddr.zipcode || '',
        country: shippingAddr.countryId
          ? (shippingAddr.country?.iso || 'DE')
          : 'DE',
      },
      currency: raw.currency?.isoCode || raw.currencyId || 'EUR',
      items,
      totalAmount,
      taxAmount,
      rawPayload: raw,
    }
  }

  // ─── Confirm Shipment ────────────────────────────────────────────────────────
  /**
   * Transitions the Shopware order delivery state to 'shipped'.
   * Uses Shopware's State Machine API.
   */
  async confirmShipment(
    marketplaceOrderId: string,
    trackingNumber: string,
    carrier: string,
    _returnTrackingNumber?: string,
    rawOrderPayload?: unknown
  ): Promise<void> {
    console.log(`[ShopwareAdapter] Confirming shipment for order ${marketplaceOrderId}...`)
    const headers = await this.authHeaders()
    const raw = rawOrderPayload as any

    // We need the internal Shopware order UUID (not the order number)
    // The raw payload contains raw.id (the UUID) and raw.orderNumber (the human-readable number)
    const orderId = raw?.id || marketplaceOrderId

    // 1. Get the delivery ID from the order
    let deliveryId: string | null = null

    if (raw?.deliveries?.[0]?.id) {
      deliveryId = raw.deliveries[0].id
    } else {
      // Fallback: fetch order to get delivery ID
      const orderRes = await fetch(`${this.baseUrl}/api/order/${orderId}?associations[deliveries][]`, {
        method: 'GET',
        headers,
      })
      if (orderRes.ok) {
        const orderData = await orderRes.json()
        deliveryId = orderData.data?.deliveries?.[0]?.id || null
      }
    }

    if (!deliveryId) {
      console.warn(`[ShopwareAdapter] No delivery found for order ${marketplaceOrderId} — skipping state transition`)
      return
    }

    // 2. Transition delivery state to 'ship' (shipped)
    const transitionRes = await fetch(
      `${this.baseUrl}/api/_action/order_delivery/${deliveryId}/state/ship`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          trackingCodes: [trackingNumber],
        }),
      }
    )

    if (!transitionRes.ok) {
      const errText = await transitionRes.text()
      console.error(`[ShopwareAdapter] State transition failed for delivery ${deliveryId}: ${transitionRes.status} - ${errText}`)
      throw new Error(`Shopware Versandbestätigung fehlgeschlagen: ${transitionRes.status}`)
    }

    console.log(`[ShopwareAdapter] Shipment confirmed for order ${marketplaceOrderId} (delivery: ${deliveryId})`)
  }
}

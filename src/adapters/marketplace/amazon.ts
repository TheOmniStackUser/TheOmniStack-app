import type { MarketplaceAdapter, NormalizedOrder } from './base'

type AmazonAdapterConfig = {
  sellerId: string
  clientId: string
  clientSecret: string
  refreshToken: string
}

export class AmazonAdapter implements MarketplaceAdapter {
  readonly marketplace = 'amazon' as const
  private readonly baseUrl = 'https://sellingpartnerapi-eu.amazon.com'
  private readonly marketplaceId = 'A1PA6795UKMFR9' // Default Amazon.de

  constructor(private readonly config: AmazonAdapterConfig) {}

  private async getAccessToken(): Promise<string> {
    const response = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.config.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Amazon LWA Error: ${err}`)
    }

    const data = await response.json()
    return data.access_token
  }

  async fetchUnshippedOrders(_companyId: string): Promise<NormalizedOrder[]> {
    try {
      console.log(`[AmazonAdapter] Fetching access token...`)
      const accessToken = await this.getAccessToken()

      console.log(`[AmazonAdapter] Fetching orders...`)
      // Get Unshipped MFN orders
      const ordersUrl = `${this.baseUrl}/orders/v0/orders?MarketplaceIds=${this.marketplaceId}&FulfillmentChannels=MFN&OrderStatuses=Unshipped`
      const ordersResponse = await fetch(ordersUrl, {
        headers: {
          'x-amz-access-token': accessToken,
          'Accept': 'application/json'
        }
      })

      if (!ordersResponse.ok) {
        const err = await ordersResponse.text()
        throw new Error(`Amazon Orders API Error: ${err}`)
      }

      const ordersData = await ordersResponse.json()
      const rawOrders = ordersData.payload?.Orders || []
      
      const normalizedOrders: NormalizedOrder[] = []

      for (const rawOrder of rawOrders) {
        console.log(`[AmazonAdapter] Fetching items for order ${rawOrder.AmazonOrderId}...`)
        const itemsUrl = `${this.baseUrl}/orders/v0/orders/${rawOrder.AmazonOrderId}/orderItems`
        const itemsResponse = await fetch(itemsUrl, {
          headers: {
            'x-amz-access-token': accessToken,
            'Accept': 'application/json'
          }
        })

        if (!itemsResponse.ok) {
          console.warn(`[AmazonAdapter] Could not fetch items for order ${rawOrder.AmazonOrderId}`)
          continue
        }

        const itemsData = await itemsResponse.json()
        const rawItems = itemsData.payload?.OrderItems || []
        
        normalizedOrders.push(this.normalizeOrder(rawOrder, rawItems))
      }

      return normalizedOrders
    } catch (error: any) {
      console.error(`[AmazonAdapter] Sync failed:`, error)
      throw error
    }
  }

  private normalizeOrder(rawOrder: any, rawItems: any[]): NormalizedOrder {
    const totalAmount = parseFloat(rawOrder.OrderTotal?.Amount || '0')
    // Default tax calculation if not provided by SP-API
    const taxAmount = totalAmount * 0.1596 // Naive 19% back-calculation or 0 if unknown

    return {
      marketplaceOrderId: rawOrder.AmazonOrderId,
      marketplace: 'amazon',
      purchaseDate: new Date(rawOrder.PurchaseDate),
      buyer: {
        name: rawOrder.ShippingAddress?.Name || 'Amazon Kunde',
        email: rawOrder.BuyerEmail || '',
      },
      shippingAddress: {
        name: rawOrder.ShippingAddress?.Name || '',
        street: rawOrder.ShippingAddress?.AddressLine1 || '',
        city: rawOrder.ShippingAddress?.City || '',
        zip: rawOrder.ShippingAddress?.PostalCode || '',
        country: rawOrder.ShippingAddress?.CountryCode || 'DE',
      },
      currency: rawOrder.OrderTotal?.CurrencyCode || 'EUR',
      items: rawItems.map(item => ({
        sku: item.SellerSKU || '',
        title: item.Title || '',
        quantity: Number(item.QuantityOrdered || 1),
        unitPrice: parseFloat(item.ItemPrice?.Amount || '0') / Number(item.QuantityOrdered || 1),
        taxRate: 0.19, // Standard for Amazon DE if not specified
      })),
      totalAmount,
      taxAmount,
      rawPayload: { rawOrder, rawItems }
    }
  }
}

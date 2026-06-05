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
        phone: rawOrder.ShippingAddress?.Phone || undefined,
      },
      shippingAddress: {
        name: rawOrder.ShippingAddress?.Name || '',
        company: rawOrder.ShippingAddress?.CompanyName || undefined,
        addressAddition: rawOrder.ShippingAddress?.AddressLine2 || undefined,
        phone: rawOrder.ShippingAddress?.Phone || undefined,
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

  async refundOrder(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: unknown
  ): Promise<boolean> {
    console.log(`[AmazonAdapter] Simulating SP-API refund for order ${marketplaceOrderId}...`)
    try {
      const xmlItems = refundItems.map((item, idx) => `
        <Message>
          <MessageID>${idx + 1}</MessageID>
          <PaymentAdjustment>
            <AmazonOrderID>${marketplaceOrderId}</AmazonOrderID>
            <AdjustedItem>
              <MerchantOrderItemID>${item.sku}</MerchantOrderItemID>
              <AdjustmentReason>CustomerReturn</AdjustmentReason>
              <ItemPriceAdjustments>
                <Component>
                  <Type>Principal</Type>
                  <Amount currency="EUR">0.00</Amount>
                </Component>
              </ItemPriceAdjustments>
              <Quantity>${item.quantity}</Quantity>
            </AdjustedItem>
          </PaymentAdjustment>
        </Message>`).join('\n')

      const feedXml = `<?xml version="1.0" encoding="utf-8"?>
<AmazonEnvelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="amzn-envelope.xsd">
  <Header>
    <DocumentVersion>1.01</DocumentVersion>
    <MerchantIdentifier>${this.config.sellerId}</MerchantIdentifier>
  </Header>
  <MessageType>OrderAdjustment</MessageType>
  ${xmlItems}
</AmazonEnvelope>`

      console.log(`[AmazonAdapter] Generated Payment Adjustment XML Feed:\n${feedXml}`)
      console.log(`[AmazonAdapter] Refund simulated successfully for Amazon Order ${marketplaceOrderId}`)
      return true
    } catch (error) {
      console.error(`[AmazonAdapter] Error during simulated refund:`, error)
      return false
    }
  }

  /**
   * Fetch products from Amazon SP-API
   */
  async fetchProducts(companyId: string): Promise<import('./base').MarketplaceProduct[]> {
    try {
      console.log(`[AmazonAdapter] Fetching access token...`)
      const accessToken = await this.getAccessToken()

      // SP-API doesn't have a simple "get all listings" endpoint without using Reports API.
      // We'll simulate fetching from catalog/listings using the Catalog Items API v2022-04-01 
      // with a generic search, or using the Reports API in a real scenario.
      // For this implementation, we simulate fetching items via Catalog API.
      const catalogUrl = `${this.baseUrl}/catalog/2022-04-01/items?marketplaceIds=${this.marketplaceId}&sellerId=${this.config.sellerId}`
      
      console.log(`[AmazonAdapter] Fetching products via GET ${catalogUrl}...`)
      const response = await fetch(catalogUrl, {
        headers: {
          'x-amz-access-token': accessToken,
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        const err = await response.text()
        console.error(`[AmazonAdapter] Amazon Catalog API Error: ${err}`)
        // Return empty array for now instead of throwing if we don't have catalog access
        return []
      }

      const data = await response.json()
      const items = data.items || []

      return items.map((item: any) => ({
        marketplaceProductId: item.asin,
        sku: item.identifiers?.[0]?.identifiers?.find((i: any) => i.identifierType === 'SKU')?.identifier || item.asin,
        title: item.summaries?.[0]?.itemName || item.asin,
        price: item.offers?.[0]?.price?.amount || 0,
        stock: item.offers?.[0]?.quantity || 0,
        rawPayload: item
      }))
    } catch (error: any) {
      console.error(`[AmazonAdapter] Error fetching products:`, error)
      throw error
    }
  }

  /**
   * Sync inventory and/or prices back to Amazon SP-API.
   */
  async updateListings(
    companyId: string, 
    updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number }[]
  ): Promise<void> {
    if (!updates || updates.length === 0) return

    try {
      const accessToken = await this.getAccessToken()

      for (const update of updates) {
        // Use Listings Items API v2021-08-01 for patching stock/price
        const sku = encodeURIComponent(update.sku)
        const patchUrl = `${this.baseUrl}/listings/2021-08-01/items/${this.config.sellerId}/${sku}?marketplaceIds=${this.marketplaceId}`
        
        const patches: any[] = []
        if (update.stock !== undefined) {
          patches.push({
            op: 'replace',
            path: '/attributes/fulfillment_availability',
            value: [{ fulfillment_channel_code: 'DEFAULT', quantity: update.stock }]
          })
        }
        if (update.price !== undefined) {
          patches.push({
            op: 'replace',
            path: '/attributes/purchasable_offer',
            value: [{ currency: 'EUR', our_price: [{ schedule: [{ value_with_tax: update.price }] }] }]
          })
        }

        if (patches.length === 0) continue

        console.log(`[AmazonAdapter] Patching listing ${sku} via PATCH ${patchUrl}...`)
        const response = await fetch(patchUrl, {
          method: 'PATCH',
          headers: {
            'x-amz-access-token': accessToken,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            productType: 'PRODUCT',
            patches
          })
        })

        if (!response.ok) {
          const errText = await response.text()
          console.error(`[AmazonAdapter] Update listing failed for ${sku}: ${errText}`)
        } else {
          console.log(`[AmazonAdapter] Successfully updated listing ${sku}.`)
        }
      }
    } catch (error) {
      console.error(`[AmazonAdapter] Error updating listings:`, error)
      throw error
    }
  }
}

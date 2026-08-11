import { MarketplaceAdapter, NormalizedOrder, MarketplaceProduct } from './base'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { orders } from '@/db/schema/orders'
import { eq, and } from 'drizzle-orm'

export class EbayAdapter implements MarketplaceAdapter {
  readonly marketplace = 'ebay'
  private readonly productionBaseUrl = 'https://api.ebay.com'
  private readonly sandboxBaseUrl = 'https://api.sandbox.ebay.com'

  async fetchUnshippedOrders(companyId: string, options?: { fromDate?: string; toDate?: string }): Promise<NormalizedOrder[]> {
    const integration = await this.getIntegration(companyId)
    if (!integration) return []

    const accessToken = await this.getAccessToken(integration)
    const baseUrl = integration.environment === 'sandbox' ? this.sandboxBaseUrl : this.productionBaseUrl

    // Fulfillment API: Get Unshipped Orders
    // We only fetch orders with orderFulfillmentStatus=NOT_STARTED or IN_PROGRESS
    let filter = `orderFulfillmentStatus:{NOT_STARTED|IN_PROGRESS}`
    
    if (options?.fromDate) {
      filter += `,creationDate:[${options.fromDate}T00:00:00.000Z..]`
    }

    const endpoint = `${baseUrl}/sell/fulfillment/v1/order?filter=${encodeURIComponent(filter)}&limit=100`
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[EbayAdapter] Error fetching orders:', errText)
      throw new Error(`eBay API Error fetching orders: ${res.status}`)
    }

    const data = await res.json()
    const ebayOrders = data.orders || []
    
    return this.mapOrders(ebayOrders)
  }

  private mapOrders(ebayOrders: any[]): NormalizedOrder[] {
    return ebayOrders.map((order: any): NormalizedOrder => {
      const totalAmount = parseFloat(order.pricingSummary?.total?.value || '0')
      const taxAmount = parseFloat(order.pricingSummary?.tax?.value || '0')
      
      const items = (order.lineItems || []).map((item: any) => {
        return {
          sku: item.sku || item.legacyItemId || 'unknown',
          title: item.title || 'eBay Item',
          quantity: item.quantity || 1,
          unitPrice: parseFloat(item.lineItemCost?.value || '0'),
          taxRate: 0.19 // Defaulting, eBay doesn't always provide % easily
        }
      })

      const shipping = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo || {}

      return {
        marketplaceOrderId: order.orderId,
        marketplace: 'ebay',
        purchaseDate: new Date(order.creationDate),
        buyer: {
          name: shipping.fullName || 'eBay Kunde',
          email: shipping.email || '',
          phone: shipping.primaryPhone?.phoneNumber || undefined,
        },
        shippingAddress: {
          name: shipping.fullName || 'eBay Kunde',
          street: `${shipping.contactAddress?.addressLine1 || ''} ${shipping.contactAddress?.addressLine2 || ''}`.trim(),
          city: shipping.contactAddress?.city || '',
          zip: shipping.contactAddress?.postalCode || '',
          country: shipping.contactAddress?.countryCode || 'DE',
          company: shipping.companyName || undefined,
        },
        currency: order.pricingSummary?.total?.currency || 'EUR',
        items,
        totalAmount,
        taxAmount,
        rawPayload: order,
      }
    })
  }

  async confirmShipment(
    marketplaceOrderId: string,
    trackingNumber: string,
    carrier: string,
    returnTrackingNumber?: string,
    rawOrderPayload?: unknown
  ): Promise<void> {
    const [orderRow] = await db
      .select()
      .from(orders)
      .where(eq(orders.marketplaceOrderId, marketplaceOrderId))
      .limit(1)

    if (!orderRow) {
       console.warn(`[EbayAdapter] Order ${marketplaceOrderId} not found in DB`)
       return
    }

    const integration = await this.getIntegration(orderRow.companyId)
    if (!integration) return

    const accessToken = await this.getAccessToken(integration)
    const baseUrl = integration.environment === 'sandbox' ? this.sandboxBaseUrl : this.productionBaseUrl

    const payload = {
      lineItems: [], // empty means all unfulfilled line items
      shippingFulfillmentDetails: {
        shippingCarrierCode: carrier,
        trackingNumber: trackingNumber
      }
    }

    const endpoint = `${baseUrl}/sell/fulfillment/v1/order/${marketplaceOrderId}/shipping_fulfillment`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`eBay API Error confirming shipment: ${res.status} - ${errText}`)
    }
  }

  async refundOrder(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: unknown
  ): Promise<boolean> {
    const [orderRow] = await db
      .select()
      .from(orders)
      .where(eq(orders.marketplaceOrderId, marketplaceOrderId))
      .limit(1)

    if (!orderRow) {
       console.warn(`[EbayAdapter] Order ${marketplaceOrderId} not found in DB`)
       return false
    }

    const integration = await this.getIntegration(orderRow.companyId)
    if (!integration) return false

    const accessToken = await this.getAccessToken(integration)
    const baseUrl = integration.environment === 'sandbox' ? this.sandboxBaseUrl : this.productionBaseUrl

    // Fetch the order to get lineItemIds and amounts
    const endpoint = `${baseUrl}/sell/fulfillment/v1/order/${marketplaceOrderId}`
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!res.ok) {
       console.error(`[EbayAdapter] Failed to fetch order for refund:`, await res.text())
       return false
    }

    const orderData = await res.json()
    const lineItems = orderData.lineItems || []
    
    // Check if it's a full refund or partial
    let isFullRefund = true
    const refundLineItems: any[] = []

    for (const line of lineItems) {
       const sku = line.sku || line.legacyItemId
       const requestedRefundItem = refundItems.find(r => r.sku === sku)
       
       if (!requestedRefundItem) {
          isFullRefund = false
       } else {
          if (requestedRefundItem.quantity < line.quantity) {
             isFullRefund = false
          }
          refundLineItems.push({
             lineItemId: line.lineItemId,
             quantity: requestedRefundItem.quantity
          })
       }
    }

    // Call eBay issue_refund API
    const refundPayload = {
      reasonForRefund: 'BUYER_RETURN',
      comment: 'Refund processed via OmniStack',
      orderLevelRefundAmount: isFullRefund ? orderData.pricingSummary?.total : undefined,
      refundItems: isFullRefund ? undefined : refundLineItems.map(item => ({
         lineItemId: item.lineItemId,
         refundAmount: {
            value: (parseFloat(lineItems.find((l:any) => l.lineItemId === item.lineItemId).lineItemCost.value) * item.quantity).toFixed(2),
            currency: orderData.pricingSummary?.total?.currency || 'EUR'
         }
      }))
    }

    const refundEndpoint = `${baseUrl}/sell/fulfillment/v1/order/${marketplaceOrderId}/issue_refund`
    const refundRes = await fetch(refundEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(refundPayload)
    })

    if (!refundRes.ok) {
      const errText = await refundRes.text()
      console.error(`[EbayAdapter] Error issuing refund: ${refundRes.status} - ${errText}`)
      return false
    }

    return true
  }

  async fetchProducts(companyId: string): Promise<MarketplaceProduct[]> {
    const integration = await this.getIntegration(companyId)
    if (!integration) return []

    const accessToken = await this.getAccessToken(integration)
    const baseUrl = integration.environment === 'sandbox' ? this.sandboxBaseUrl : this.productionBaseUrl

    let offset = 0
    let limit = 100
    const allProducts: MarketplaceProduct[] = []
    let hasMore = true

    while (hasMore) {
      const endpoint = `${baseUrl}/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store',
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error('[EbayAdapter] Error fetching products:', errText)
        throw new Error(`eBay API Error fetching products: ${res.status}`)
      }

      const data = await res.json()
      const items = data.inventoryItems || []

      for (const item of items) {
        allProducts.push({
          marketplaceProductId: item.sku,
          sku: item.sku,
          title: item.product?.title || item.sku,
          price: parseFloat(item.pricingSummary?.price?.value || '0'),
          stock: item.availability?.shipToLocationAvailability?.quantity || 0,
          rawPayload: item,
        })
      }

      if (items.length < limit) {
        hasMore = false
      } else {
        offset += limit
      }
    }

    return allProducts
  }

  async updateListings(companyId: string, updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number }[]): Promise<void> {
    if (!updates || updates.length === 0) return

    const integration = await this.getIntegration(companyId)
    if (!integration) return

    const accessToken = await this.getAccessToken(integration)
    const baseUrl = integration.environment === 'sandbox' ? this.sandboxBaseUrl : this.productionBaseUrl

    for (const update of updates) {
       // Fetch existing item to do a partial update (or we could use bulk update if needed)
       const endpoint = `${baseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(update.sku)}`
       const res = await fetch(endpoint, {
         method: 'GET',
         headers: {
           'Authorization': `Bearer ${accessToken}`,
           'Content-Type': 'application/json'
         }
       })

       if (!res.ok) continue // Item might not exist or error

       const item = await res.json()

       if (update.stock !== undefined) {
          if (!item.availability) item.availability = {}
          if (!item.availability.shipToLocationAvailability) item.availability.shipToLocationAvailability = {}
          item.availability.shipToLocationAvailability.quantity = update.stock
       }

       if (update.price !== undefined) {
          if (!item.pricingSummary) item.pricingSummary = {}
          if (!item.pricingSummary.price) item.pricingSummary.price = { currency: 'EUR' }
          item.pricingSummary.price.value = update.price.toString()
       }

       // Put the item back
       await fetch(endpoint, {
         method: 'PUT',
         headers: {
           'Authorization': `Bearer ${accessToken}`,
           'Content-Language': 'de-DE',
           'Content-Type': 'application/json'
         },
         body: JSON.stringify(item)
       })
    }
  }

  private async getIntegration(companyId: string) {
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.type, 'ebay'),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
      .limit(1)

    if (!integration || !integration.clientId || !integration.clientSecret) {
      console.warn(`[Ebay] No active/valid credentials found for company ${companyId}`)
      return null
    }

    return integration
  }

  private async getAccessToken(integration: any): Promise<string> {
    const now = new Date()
    
    if (integration.accessToken && integration.expiresAt && integration.expiresAt > new Date(now.getTime() + 60000)) {
      return integration.accessToken
    }

    if (!integration.refreshToken) {
      throw new Error(`eBay: No refresh token available`)
    }

    const clientId = process.env.EBAY_CLIENT_ID
    const clientSecret = process.env.EBAY_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      throw new Error(`eBay client credentials not configured in environment`)
    }

    const isSandbox = integration.environment === 'sandbox'
    const tokenUrl = isSandbox 
      ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token' 
      : 'https://api.ebay.com/identity/v1/oauth2/token'

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    
    // eBay specific: for refresh token we also pass scope in some cases, but not strictly required if we want the same scopes
    const body = new URLSearchParams()
    body.append('grant_type', 'refresh_token')
    body.append('refresh_token', integration.refreshToken)
    
    const scope = [
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.finances'
    ].join(' ')
    body.append('scope', scope)

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: body.toString(),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Failed to refresh eBay token: ${res.status} ${errText}`)
    }

    const data = await res.json()

    await db
      .update(marketplaceIntegrations)
      .set({
        accessToken: data.access_token,
        expiresAt: new Date(now.getTime() + data.expires_in * 1000),
        updatedAt: new Date(),
      })
      .where(eq(marketplaceIntegrations.id, integration.id))

    return data.access_token
  }
}

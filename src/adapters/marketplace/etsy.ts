import { MarketplaceAdapter, NormalizedOrder, MarketplaceProduct } from './base'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { orders } from '@/db/schema/orders'
import { eq, and } from 'drizzle-orm'

export class EtsyAdapter implements MarketplaceAdapter {
  readonly marketplace = 'etsy'
  private readonly baseUrl = 'https://openapi.etsy.com/v3/application'

  async fetchUnshippedOrders(companyId: string, options?: { fromDate?: string; toDate?: string }): Promise<NormalizedOrder[]> {
    const integration = await this.getIntegration(companyId)
    if (!integration) return []

    const accessToken = await this.getAccessToken(integration)
    const shopId = await this.getShopId(integration.clientId!, integration.clientSecret!, accessToken)

    // Fetch unshipped orders
    const endpoint = `${this.baseUrl}/shops/${shopId}/receipts?was_shipped=false&was_paid=true&limit=100`
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'x-api-key': `${integration.clientId!}:${integration.clientSecret!}`,
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Etsy API Error fetching orders: ${res.status} - ${errText}`)
    }

    const data = await res.json()
    const receipts = data.results || []
    
    // API was_shipped=false still returns completed digital orders (which don't ship).
    // So we manually filter out completed, canceled, and shipped orders.
    const unshippedReceipts = receipts.filter((r: any) => {
      if (r.is_shipped === true) return false
      if (r.status?.toLowerCase() === 'completed') return false
      if (r.status?.toLowerCase() === 'canceled') return false
      return true
    })
    
    return this.mapOrders(unshippedReceipts)
  }

  private mapOrders(receipts: any[]): NormalizedOrder[] {
    return receipts.map((receipt: any): NormalizedOrder => {
      const totalAmount = (receipt.grandtotal?.amount || 0) / (receipt.grandtotal?.divisor || 1)
      const taxAmount = (receipt.total_tax_cost?.amount || 0) / (receipt.total_tax_cost?.divisor || 1)

      const items = (receipt.transactions || []).map((t: any) => {
        const unitPrice = (t.price?.amount || 0) / (t.price?.divisor || 1)
        return {
          sku: t.sku || t.product_data?.sku || t.listing_id?.toString() || 'unknown',
          title: t.title || 'Etsy Item',
          quantity: t.quantity || 1,
          unitPrice,
          taxRate: 0.19, // Default tax rate if unknown
        }
      })

      return {
        marketplaceOrderId: receipt.receipt_id.toString(),
        marketplace: 'etsy',
        purchaseDate: new Date(receipt.created_timestamp * 1000),
        buyer: {
          name: receipt.name || 'Etsy Kunde',
          email: receipt.buyer_email || '',
        },
        shippingAddress: {
          name: receipt.name || 'Etsy Kunde',
          street: `${receipt.first_line || ''} ${receipt.second_line || ''}`.trim(),
          city: receipt.city || '',
          zip: receipt.zip || '',
          country: receipt.country_iso || 'DE',
        },
        currency: receipt.grandtotal?.currency_code || 'EUR',
        items,
        totalAmount,
        taxAmount,
        rawPayload: receipt,
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
       console.warn(`[Etsy] Order ${marketplaceOrderId} not found in DB`)
       return
    }

    const integration = await this.getIntegration(orderRow.companyId)
    if (!integration) return

    const accessToken = await this.getAccessToken(integration)
    const shopId = await this.getShopId(integration.clientId!, integration.clientSecret!, accessToken)

    const payload = new URLSearchParams({
      tracking_code: trackingNumber,
      carrier_name: carrier
    })

    const endpoint = `${this.baseUrl}/shops/${shopId}/receipts/${marketplaceOrderId}/tracking`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': `${integration.clientId!}:${integration.clientSecret!}`,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload.toString()
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Etsy API Error confirming shipment: ${res.status} - ${errText}`)
    }
  }

  async fetchProducts(companyId: string): Promise<MarketplaceProduct[]> {
    const integration = await this.getIntegration(companyId)
    if (!integration) return []

    const accessToken = await this.getAccessToken(integration)
    const shopId = await this.getShopId(integration.clientId!, integration.clientSecret!, accessToken)

    let offset = 0
    let limit = 100
    const allProducts: MarketplaceProduct[] = []
    let hasMore = true

    while (hasMore) {
      const endpoint = `${this.baseUrl}/shops/${shopId}/listings/active?limit=${limit}&offset=${offset}`
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'x-api-key': `${integration.clientId!}:${integration.clientSecret!}`,
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Etsy API Error fetching products: ${res.status} - ${errText}`)
      }

      const data = await res.json()
      const listings = data.results || []

      for (const listing of listings) {
        // Fetch inventory to get SKUs, stock and price
        const inventoryRes = await fetch(`${this.baseUrl}/listings/${listing.listing_id}/inventory`, {
          method: 'GET',
          headers: {
            'x-api-key': `${integration.clientId!}:${integration.clientSecret!}`,
            'Authorization': `Bearer ${accessToken}`,
          }
        })
        
        let sku = listing.listing_id.toString()
        let stock = listing.quantity
        let price = (listing.price?.amount || 0) / (listing.price?.divisor || 1)

        if (inventoryRes.ok) {
           const invData = await inventoryRes.json()
           if (invData.products && invData.products.length > 0) {
              const product = invData.products[0]
              sku = product.sku || sku
              if (product.offerings && product.offerings.length > 0) {
                 stock = product.offerings[0].quantity
                 price = (product.offerings[0].price?.amount || 0) / (product.offerings[0].price?.divisor || 1)
              }
           }
        }

        allProducts.push({
          marketplaceProductId: listing.listing_id.toString(),
          sku: sku,
          title: listing.title,
          price: price,
          stock: stock,
          rawPayload: listing,
        })
      }

      if (listings.length < limit) {
        hasMore = false
      } else {
        offset += limit
      }
    }

    return allProducts
  }

  private async getIntegration(companyId: string) {
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.type, 'etsy'),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
      .limit(1)

    if (!integration || !integration.clientId || !integration.clientSecret) {
      console.warn(`[Etsy] No active/valid credentials found for company ${companyId}`)
      return null
    }

    return integration
  }

  private async getAccessToken(integration: any): Promise<string> {
    const now = new Date()
    
    // Valid access token available
    if (integration.accessToken && integration.expiresAt && integration.expiresAt > new Date(now.getTime() + 60000)) {
      return integration.accessToken
    }

    // Need to refresh
    if (!integration.refreshToken) {
      throw new Error(`Etsy: No refresh token available`)
    }

    const refreshBody = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: integration.clientId,
      refresh_token: integration.refreshToken
    })

    const res = await fetch('https://api.etsy.com/v3/public/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: refreshBody.toString()
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Etsy Token Refresh Error: ${res.status} - ${errText}`)
    }

    const data = await res.json()
    const newAccessToken = data.access_token
    const newRefreshToken = data.refresh_token
    const expiresIn = data.expires_in // seconds

    await db.update(marketplaceIntegrations)
      .set({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        updatedAt: new Date()
      })
      .where(eq(marketplaceIntegrations.id, integration.id))

    return newAccessToken
  }

  private async getShopId(clientId: string, clientSecret: string, accessToken: string): Promise<string> {
    // 1. Get user id
    const userRes = await fetch(`${this.baseUrl}/users/me`, {
       method: 'GET',
       headers: {
          'x-api-key': `${clientId}:${clientSecret}`,
          'Authorization': `Bearer ${accessToken}`
       }
    })
    
    if (!userRes.ok) {
      const err = await userRes.text()
      throw new Error(`Etsy API Error fetching user: ${userRes.status} - ${err}`)
    }

    const userData = await userRes.json()
    const userId = userData.user_id

    // 2. Get shop id for user
    const shopRes = await fetch(`${this.baseUrl}/users/${userId}/shops`, {
       method: 'GET',
       headers: {
          'x-api-key': `${clientId}:${clientSecret}`,
          'Authorization': `Bearer ${accessToken}`
       }
    })

    if (!shopRes.ok) {
      const err = await shopRes.text()
      throw new Error(`Etsy API Error fetching shop: ${shopRes.status} - ${err}`)
    }

    const shopData = await shopRes.json()
    if (!shopData || (shopData.count === 0 && !shopData.shop_id)) {
      throw new Error('No Etsy shop found for this user.')
    }
    
    // In Etsy API V3 /users/{user_id}/shops returns a single shop object if user has a shop
    return shopData.shop_id.toString()
  }
}

import { MarketplaceAdapter, NormalizedOrder } from './base'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { orders } from '@/db/schema/orders'
import { eq, and } from 'drizzle-orm'

export class ShopifyAdapter implements MarketplaceAdapter {
  readonly marketplace = 'shopify'

  async fetchUnshippedOrders(companyId: string, options?: { fromDate?: string; toDate?: string }): Promise<NormalizedOrder[]> {
    // 1. Get credentials
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.type, 'shopify'),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
      .limit(1)

    if (!integration || !integration.environment || !integration.clientId || !integration.clientSecret) {
      console.warn(`[Shopify] No active credentials found for company ${companyId}`)
      return []
    }

    // Shopify stores their URLs sometimes with or without protocol/trailing slashes.
    let shopUrl = integration.environment
    if (!shopUrl.startsWith('http')) {
      shopUrl = `https://${shopUrl}`
    }
    shopUrl = shopUrl.replace(/\/$/, '') // remove trailing slash

    console.log(`[Shopify] Fetching access token for: ${shopUrl}`)
    
    // 1. Get Access Token via Client Credentials Flow (New 2026 Standard)
    const tokenRes = await fetch(`${shopUrl}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: integration.clientId,
        client_secret: integration.clientSecret,
        grant_type: 'client_credentials'
      })
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      console.error(`[Shopify] Token exchange failed: ${tokenRes.status} - ${errText}`)
      // Fallback: maybe they entered a direct token in the secret field
      if (integration.clientSecret.startsWith('shpat_')) {
         return this.fetchWithToken(shopUrl, integration.clientSecret, options)
      }
      throw new Error(`Shopify Auth Fehler: ${tokenRes.status} - ${errText}`)
    }

    const { access_token } = await tokenRes.json()
    console.log('[Shopify] Token exchange successful.')
    
    return this.fetchWithToken(shopUrl, access_token, options)
  }

  private async fetchWithToken(shopUrl: string, token: string, options?: any): Promise<NormalizedOrder[]> {
    const endpoint = `${shopUrl}/admin/api/2024-01/orders.json?status=any&limit=50`
    const res = await fetch(endpoint, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      }
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Shopify API Fehler: ${res.status} - ${errText}`)
    }

    const data = await res.json()
    return this.mapOrders(data.orders || [])
  }

  private mapOrders(orders: any[]): NormalizedOrder[] {
    return orders.map((order: any): NormalizedOrder => {
      // Shipping address
      const sa = order.shipping_address || order.billing_address || {}
      
      const taxAmount = parseFloat(order.total_tax || '0')
      const totalAmount = parseFloat(order.total_price || '0')
      
      const totalWeightKg = order.total_weight ? order.total_weight / 1000 : undefined

      const items = (order.line_items || []).map((li: any) => {
        const unitPrice = parseFloat(li.price || '0')
        // Shopify line items don't provide tax rate easily, but we can try to guess it from unit tax or default to 19%
        const liTaxLines = li.tax_lines || []
        const taxRate = liTaxLines.length > 0 ? liTaxLines[0].rate : 0.19

        return {
          sku: li.sku || li.id.toString(),
          title: li.title || 'Shopify Item',
          quantity: li.quantity,
          unitPrice,
          taxRate,
        }
      })

      return {
        marketplaceOrderId: order.id.toString(),
        marketplace: 'shopify',
        purchaseDate: new Date(order.created_at),
        buyer: {
          name: sa.name || order.customer?.first_name + ' ' + order.customer?.last_name || 'Unbekannt',
          email: order.contact_email || order.email || order.customer?.email,
        },
        shippingAddress: {
          name: sa.name || order.customer?.first_name + ' ' + order.customer?.last_name || 'Unbekannt',
          street: `${sa.address1 || ''} ${sa.address2 || ''}`.trim(),
          city: sa.city || '',
          zip: sa.zip || '',
          country: sa.country_code || 'DE',
        },
        currency: order.currency || 'EUR',
        items,
        totalAmount,
        taxAmount,
        totalWeight: totalWeightKg,
        rawPayload: order, // Preserve raw Shopify payload
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
    const rawOrder = rawOrderPayload as any
    if (!rawOrder || !rawOrder.id) {
      console.warn(`[Shopify] Cannot confirm shipment for ${marketplaceOrderId} without raw order data.`)
      return
    }

    // 1. Get credentials (in a real app, you might pass companyId down, or lookup via DB)
    // To do this, we need companyId. Let's look it up via marketplaceOrderId if not provided
    const [orderRow] = await db
      .select()
      .from(orders)
      .where(eq(orders.marketplaceOrderId, marketplaceOrderId))
      .limit(1)

    if (!orderRow) {
       console.warn(`[Shopify] Order ${marketplaceOrderId} not found in DB`)
       return
    }

    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, orderRow.companyId),
          eq(marketplaceIntegrations.type, 'shopify'),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
      .limit(1)

    if (!integration || !integration.environment || !integration.clientId || !integration.clientSecret) {
      console.warn(`[Shopify] No active credentials found for company ${orderRow.companyId}`)
      return
    }

    let shopUrl = integration.environment
    if (!shopUrl.startsWith('http')) shopUrl = `https://${shopUrl}`
    shopUrl = shopUrl.replace(/\/$/, '')

    // Get Access Token
    const tokenRes = await fetch(`${shopUrl}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: integration.clientId,
        client_secret: integration.clientSecret,
        grant_type: 'client_credentials'
      })
    })

    let accessToken = ''
    if (tokenRes.ok) {
      const data = await tokenRes.json()
      accessToken = data.access_token
    } else if (integration.clientSecret.startsWith('shpat_')) {
      accessToken = integration.clientSecret
    } else {
      const errText = await tokenRes.text()
      throw new Error(`Shopify Auth Fehler: ${tokenRes.status} - ${errText}`)
    }

    const headers = {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    }

    // For fulfillment, we usually need the Location ID.
    // Fetch locations
    const locRes = await fetch(`${shopUrl}/admin/api/2024-01/locations.json`, { headers })
    if (!locRes.ok) {
       console.error(`[Shopify] Failed to fetch locations`)
       return
    }
    const locData = await locRes.json()
    const locationId = locData.locations[0]?.id

    if (!locationId) {
       console.error(`[Shopify] No active location found`)
       return
    }

    // Post fulfillment
    // https://shopify.dev/docs/api/admin-rest/2024-01/resources/fulfillment#post-orders-order_id-fulfillments
    const fulfillmentPayload = {
      fulfillment: {
        location_id: locationId,
        tracking_number: trackingNumber,
        tracking_company: carrier,
      }
    }

    const fulfillRes = await fetch(`${shopUrl}/admin/api/2024-01/orders/${marketplaceOrderId}/fulfillments.json`, {
      method: 'POST',
      headers,
      body: JSON.stringify(fulfillmentPayload)
    })

    if (!fulfillRes.ok) {
       console.error(`[Shopify] Failed to fulfill order ${marketplaceOrderId}: ${fulfillRes.statusText}`)
       const errorText = await fulfillRes.text()
       console.error(errorText)
       throw new Error('Failed to confirm Shopify shipment')
    }
    
    console.log(`[Shopify] Shipment confirmed for order ${marketplaceOrderId}`)
  }
}

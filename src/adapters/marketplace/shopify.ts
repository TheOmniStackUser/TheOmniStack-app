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

    if (!integration || !integration.environment) {
      console.warn(`[Shopify] No active credentials found for company ${companyId}`)
      return []
    }

    let shopUrl = integration.environment
    if (!shopUrl.startsWith('http')) {
      shopUrl = `https://${shopUrl}`
    }
    shopUrl = shopUrl.replace(/\/$/, '')

    try {
      const accessToken = await this.getAccessToken(integration)
      return this.fetchWithToken(shopUrl, accessToken, options)
    } catch (err) {
      console.error(`[Shopify] Error getting access token:`, err)
      return []
    }
  }

  private async fetchWithToken(shopUrl: string, token: string, options?: any): Promise<NormalizedOrder[]> {
    const endpoint = `${shopUrl}/admin/api/2024-01/orders.json?status=any&limit=50`
    const res = await fetch(endpoint, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      cache: 'no-store'
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
          phone: order.customer?.phone || order.billing_address?.phone || undefined,
        },
        shippingAddress: {
          name: sa.name || order.customer?.first_name + ' ' + order.customer?.last_name || 'Unbekannt',
          company: sa.company || undefined,
          addressAddition: sa.address2 || undefined,
          phone: sa.phone || undefined,
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

    if (!integration || !integration.environment) {
      console.warn(`[Shopify] No active credentials found for company ${orderRow.companyId}`)
      return
    }

    let shopUrl = integration.environment
    if (!shopUrl.startsWith('http')) shopUrl = `https://${shopUrl}`
    shopUrl = shopUrl.replace(/\/$/, '')

    const accessToken = await this.getAccessToken(integration)

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

  async refundOrder(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: unknown
  ): Promise<boolean> {
    console.log(`[Shopify] Refunding order ${marketplaceOrderId}...`)
    try {
      // 1. Fetch order from DB to get companyId
      const [orderRow] = await db
        .select()
        .from(orders)
        .where(eq(orders.marketplaceOrderId, marketplaceOrderId))
        .limit(1)

      if (!orderRow) {
        console.warn(`[Shopify] Order ${marketplaceOrderId} not found in DB`)
        return false
      }

      // 2. Fetch active Shopify integration
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

      if (!integration || !integration.environment) {
        console.warn(`[Shopify] No active credentials found for company ${orderRow.companyId}`)
        return false
      }

      let shopUrl = integration.environment
      if (!shopUrl.startsWith('http')) shopUrl = `https://${shopUrl}`
      shopUrl = shopUrl.replace(/\/$/, '')

      const accessToken = await this.getAccessToken(integration)

      const headers = {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      }

      // 4. Fetch the order from Shopify to get full line_items metadata
      let shopifyOrder = (rawOrderPayload as any)
      if (!shopifyOrder || !shopifyOrder.line_items) {
        console.log(`[Shopify] Fetching order details from Shopify API...`)
        const getOrderRes = await fetch(`${shopUrl}/admin/api/2024-01/orders/${marketplaceOrderId}.json`, { headers })
        if (!getOrderRes.ok) {
          const errText = await getOrderRes.text()
          throw new Error(`Failed to fetch order details from Shopify: ${getOrderRes.status} ${errText}`)
        }
        const orderData = await getOrderRes.json()
        shopifyOrder = orderData.order
      }

      if (!shopifyOrder || !shopifyOrder.line_items) {
        throw new Error(`No Shopify line items found for order ${marketplaceOrderId}`)
      }

      // 5. Map SKU to Shopify line_item IDs
      const refundLineItems = refundItems.map(item => {
        const matchingLineItem = shopifyOrder.line_items.find((li: any) => li.sku === item.sku || li.id.toString() === item.sku)
        if (!matchingLineItem) {
          console.warn(`[Shopify] No matching line item found on Shopify for SKU ${item.sku}`)
          return null
        }
        return {
          line_item_id: matchingLineItem.id,
          quantity: item.quantity,
          restock_type: 'no_restock'
        }
      }).filter(Boolean)

      if (refundLineItems.length === 0) {
        console.warn(`[Shopify] No valid line items to refund.`)
        return false
      }

      // 6. Post Refund
      const refundPayload = {
        refund: {
          currency: shopifyOrder.currency || 'EUR',
          notify: true,
          note: 'OmniScan Return Refund',
          shipping: { full_refund: false },
          refund_line_items: refundLineItems
        }
      }

      console.log(`[Shopify] Sending refund request for order ${marketplaceOrderId}...`)
      const refundRes = await fetch(`${shopUrl}/admin/api/2024-01/orders/${marketplaceOrderId}/refunds.json`, {
        method: 'POST',
        headers,
        body: JSON.stringify(refundPayload)
      })

      if (!refundRes.ok) {
        const errText = await refundRes.text()
        console.error(`[Shopify] Refund request failed: ${refundRes.status} - ${errText}`)
        throw new Error(`Shopify Refund API Error: ${errText}`)
      }

      console.log(`[Shopify] Refund processed successfully for order ${marketplaceOrderId}`)
      return true
    } catch (error) {
      console.error(`[Shopify] Error during refund:`, error)
      return false
    }
  }

  async fetchProducts(companyId: string): Promise<import('./base').MarketplaceProduct[]> {
    try {
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

      if (!integration || !integration.environment) {
        console.warn(`[Shopify] No active credentials found for company ${companyId}`)
        return []
      }

      let shopUrl = integration.environment
      if (!shopUrl.startsWith('http')) shopUrl = `https://${shopUrl}`
      shopUrl = shopUrl.replace(/\/$/, '')

      const accessToken = await this.getAccessToken(integration)

      const headers = {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      }

      let productsUrl: string | null = `${shopUrl}/admin/api/2024-01/products.json?limit=250`
      const allProducts: any[] = []

      while (productsUrl) {
        console.log(`[Shopify] Fetching products via GET ${productsUrl}...`)
        const response: Response = await fetch(productsUrl, { 
          headers,
          cache: 'no-store'
        })

        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`Shopify API fetchProducts failed: ${response.status} - ${errText}`)
        }

        const data = await response.json()
        allProducts.push(...(data.products || []))

        const linkHeader = response.headers.get('link')
        productsUrl = null
        if (linkHeader) {
          const links = linkHeader.split(',')
          const nextLink = links.find(l => l.includes('rel="next"'))
          if (nextLink) {
            const match = nextLink.match(/<([^>]+)>/)
            if (match) {
              productsUrl = match[1]
            }
          }
        }
      }

      const results: import('./base').MarketplaceProduct[] = []
      for (const product of allProducts) {
        for (const variant of product.variants || []) {
          results.push({
            marketplaceProductId: variant.id.toString(), // Shopify Variant ID
            sku: variant.sku || variant.id.toString(),
            title: `${product.title} ${variant.title !== 'Default Title' ? variant.title : ''}`.trim(),
            price: parseFloat(variant.price || '0'),
            stock: variant.inventory_quantity || 0,
            rawPayload: { product, variant }
          })
        }
      }

      return results
    } catch (error) {
      console.error(`[Shopify] Error fetching products:`, error)
      throw error
    }
  }

  async updateListings(
    companyId: string, 
    updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number }[]
  ): Promise<void> {
    if (!updates || updates.length === 0) return

    try {
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

      if (!integration || !integration.environment) {
        console.warn(`[Shopify] No active credentials found for company ${companyId}`)
        return
      }

      let shopUrl = integration.environment
      if (!shopUrl.startsWith('http')) shopUrl = `https://${shopUrl}`
      shopUrl = shopUrl.replace(/\/$/, '')

      const accessToken = await this.getAccessToken(integration)

      const headers = {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      }

      // We need location_id for inventory updates
      const locRes = await fetch(`${shopUrl}/admin/api/2024-01/locations.json`, { headers })
      let locationId = ''
      if (locRes.ok) {
        const locData = await locRes.json()
        locationId = locData.locations?.[0]?.id?.toString() || ''
      }

      for (const update of updates) {
        // Find variant ID if not provided, though we expect it in marketplaceProductId
        let variantId = update.marketplaceProductId
        let inventoryItemId = ''

        if (variantId) {
          // Update Price
          if (update.price !== undefined) {
            const variantPayload = { variant: { id: variantId, price: update.price } }
            await fetch(`${shopUrl}/admin/api/2024-01/variants/${variantId}.json`, {
              method: 'PUT',
              headers,
              body: JSON.stringify(variantPayload)
            })
          }

          // If we need to update stock, we need the inventory_item_id
          if (update.stock !== undefined && locationId) {
            const vRes = await fetch(`${shopUrl}/admin/api/2024-01/variants/${variantId}.json`, { headers })
            if (vRes.ok) {
              const vData = await vRes.json()
              inventoryItemId = vData.variant?.inventory_item_id
            }

            if (inventoryItemId) {
              const invPayload = {
                location_id: locationId,
                inventory_item_id: inventoryItemId,
                available: update.stock
              }
              await fetch(`${shopUrl}/admin/api/2024-01/inventory_levels/set.json`, {
                method: 'POST',
                headers,
                body: JSON.stringify(invPayload)
              })
            }
          }
        }
      }

      console.log(`[Shopify] Listings successfully updated.`)
    } catch (error) {
      console.error(`[Shopify] Error updating listings:`, error)
      throw error
    }
  }

  private async getAccessToken(integration: any): Promise<string> {
    const now = new Date();
    // Use token if it exists and (has no expiry, or expires more than 1 min from now)
    if (integration.accessToken && (!integration.expiresAt || integration.expiresAt > new Date(now.getTime() + 60000))) {
      return integration.accessToken;
    }

    let shopUrl = integration.environment
    if (!shopUrl.startsWith('http')) shopUrl = `https://${shopUrl}`
    shopUrl = shopUrl.replace(/\/$/, '')

    // If we have a refresh token (expiring offline token flow), we MUST refresh it
    if (integration.refreshToken) {
      const clientId = process.env.SHOPIFY_CLIENT_ID || integration.clientId;
      const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || integration.clientSecret;

      if (!clientId || !clientSecret) {
        throw new Error(`Shopify: Missing credentials for token refresh`);
      }

      console.log(`[Shopify] Refreshing expired access token for ${shopUrl}...`);
      const refreshRes = await fetch(`${shopUrl}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: integration.refreshToken
        })
      });

      if (!refreshRes.ok) {
        const errText = await refreshRes.text();
        throw new Error(`Shopify Refresh Fehler: ${refreshRes.status} - ${errText}`);
      }

      const refreshData = await refreshRes.json();
      const newAccessToken = refreshData.access_token;
      const newRefreshToken = refreshData.refresh_token;
      const newExpiresAt = refreshData.expires_in ? new Date(Date.now() + refreshData.expires_in * 1000) : null;

      // Persist the new tokens (crucial: old refresh token is voided immediately)
      await db.update(marketplaceIntegrations)
        .set({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
          updatedAt: new Date()
        })
        .where(eq(marketplaceIntegrations.id, integration.id));

      return newAccessToken;
    }

    // Fallback for custom apps using client_credentials
    if (integration.clientId && integration.clientSecret && !integration.clientSecret.startsWith('shpat_')) {
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
        throw new Error(`Shopify Auth Fehler: ${tokenRes.status} - ${errText}`)
      }
      
      const data = await tokenRes.json()
      return data.access_token;
    }

    // Fallback for static tokens
    if (integration.clientSecret && integration.clientSecret.startsWith('shpat_')) return integration.clientSecret;

    throw new Error(`Shopify: Missing credentials for token exchange`);
  }
}

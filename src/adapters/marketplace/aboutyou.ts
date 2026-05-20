// ============================================================================
// ABOUT YOU ADAPTER
// Connects to the About You Seller Center API to fetch orders
// Reference: https://partner.aboutyou.com/api/v1/docs
// ============================================================================

import type { MarketplaceAdapter, NormalizedOrder } from './base'

export type AboutYouAdapterConfig = {
  apiKey: string
  environment?: 'sandbox' | 'production'
}

export class AboutYouAdapter implements MarketplaceAdapter {
  readonly marketplace = 'aboutyou' as const
  private readonly baseUrl: string

  constructor(private readonly config: AboutYouAdapterConfig) {
    this.baseUrl = config.environment === 'sandbox'
      ? 'https://partner.aboutyou.com/api/v1' // Assuming sandbox might be a different URL or handled via key
      : 'https://partner.aboutyou.com/api/v1'
  }

  /**
   * Fetches all open orders from About You Seller Center API
   */
  async fetchUnshippedOrders(companyId: string, options?: { fromDate?: string, toDate?: string }): Promise<NormalizedOrder[]> {
    console.log(`[AboutYouAdapter] Fetching open orders for company ${companyId}...`)
    
    try {
      let url = `${this.baseUrl}/orders?order_status=open&per_page=100`
      if (options?.fromDate) url += `&orders_from=${options.fromDate}${options.fromDate.includes('T') ? '' : 'T00:00:00Z'}`
      if (options?.toDate) url += `&orders_to=${options.toDate}${options.toDate.includes('T') ? '' : 'T23:59:59Z'}`

      console.log(`[AboutYouAdapter] URL: ${url}`)

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': this.config.apiKey,
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`[AboutYouAdapter] Failed to fetch orders: ${response.status} - ${errText}`)
      }

      const responseData = await response.json()
      // About You usually returns orders in 'items' array
      const rawOrders = responseData.items || []
      
      console.log(`[AboutYouAdapter] Fetched ${rawOrders.length} raw orders from About You.`)

      return rawOrders.map((ro: any) => this.normalizeOrder(ro, companyId))
    } catch (error) {
      console.error('[AboutYouAdapter] Error syncing orders:', error)
      throw error
    }
  }

  /**
   * Normalizes the raw About You order payload into our internal NormalizedOrder format
   */
  private normalizeOrder(raw: any, companyId: string): NormalizedOrder {
    const shipping = {
      first_name: raw.shipping_recipient_first_name || '',
      last_name: raw.shipping_recipient_last_name || '',
      street: raw.shipping_street || '',
      zip_code: raw.shipping_zip_code || '',
      city: raw.shipping_city || '',
      country_code: raw.shipping_country_code || 'DE',
    }
    
    let totalAmount = 0
    let taxAmount = 0

    const items = (raw.order_items || []).map((item: any) => {
      // About You provides prices in CENTS
      const priceWithTax = parseFloat(item.price_with_tax || '0') / 100
      const vatRate = item.vat ? parseFloat(item.vat) / 100 : 0.19
      const qty = 1 
      
      totalAmount += priceWithTax
      // Calculate net from gross
      const netPrice = priceWithTax / (1 + vatRate)
      taxAmount += (priceWithTax - netPrice)

      return {
        sku: item.sku || 'UNKNOWN',
        title: item.product_name || 'About You Product',
        quantity: qty,
        unitPrice: priceWithTax, // persistOrders handles net calculation if vatSettings exist, but here we provide gross as fallback
        taxRate: vatRate,
      }
    })

    const finalTotal = raw.cost_with_tax ? parseFloat(raw.cost_with_tax) / 100 : totalAmount

    return {
      marketplace: this.marketplace,
      marketplaceOrderId: raw.order_number || raw.id?.toString(),
      purchaseDate: new Date(raw.created_at || Date.now()),
      buyer: {
        name: `${raw.billing_recipient_first_name || ''} ${raw.billing_recipient_last_name || ''}`.trim() || 'About You Customer',
        email: raw.customer_email || 'no-reply@aboutyou.market',
      },
      shippingAddress: {
        name: `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim(),
        street: shipping.street,
        city: shipping.city,
        zip: shipping.zip_code,
        country: shipping.country_code,
      },
      currency: raw.currency_code || 'EUR',
      totalAmount: finalTotal,
      taxAmount: taxAmount,
      items,
      rawPayload: raw,
    }
  }

  /**
   * Confirms a shipment on About You
   * 
   * SCAYLE / About You Seller Center requires:
   *   POST /api/v1/orders/ship
   *   Body: { items: [{ order_items: [id1, id2], shipment_provider, shipment_tracking_key }] }
   */
  async confirmShipment(
    marketplaceOrderId: string, 
    trackingNumber: string, 
    carrier: string = 'DHL', 
    returnTrackingNumber?: string,
    rawOrderPayload?: any
  ): Promise<void> {
    console.log(`[AboutYouAdapter] Confirming shipment for order ${marketplaceOrderId}...`)
    
    try {
      const rawOrder = rawOrderPayload
      if (!rawOrder || !rawOrder.order_items) {
        throw new Error(`Keine order_items für Bestellung ${marketplaceOrderId} im Payload gefunden.`)
      }

      // Collect all order_item_ids from the original payload
      const orderItemIds = rawOrder.order_items.map((item: any) => item.order_item_id || item.id)

      const shipmentPayload = {
        data: {
          items: [
            {
              order_items: orderItemIds,
              carrier_key: carrier.toUpperCase(),
              shipment_tracking_key: trackingNumber,
              return_tracking_key: returnTrackingNumber || ""
            }
          ]
        }
      }

      const response = await fetch(`${this.baseUrl}/orders/ship`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.config.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(shipmentPayload)
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`About You API Fehler: ${response.status} - ${errText}`)
      }

      console.log(`[AboutYouAdapter] Shipment confirmed successfully for ${marketplaceOrderId}`)
    } catch (error) {
      console.error('[AboutYouAdapter] Error confirming shipment:', error)
      throw error
    }
  }

  /**
   * Fetches the official delivery note PDF from About You
   */
  async getDeliveryNote(marketplaceOrderId: string): Promise<Buffer> {
    console.log(`[AboutYouAdapter] Fetching delivery note for ${marketplaceOrderId}...`)
    const url = `${this.baseUrl}/orders/${marketplaceOrderId}/delivery_document`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': this.config.apiKey,
        'Accept': 'application/pdf'
      }
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`About You API Fehler beim Lieferschein-Abruf: ${response.status} - ${errText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}

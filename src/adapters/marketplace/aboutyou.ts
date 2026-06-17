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
        phone: raw.billing_phone || raw.shipping_phone || undefined,
      },
      shippingAddress: {
        name: `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim(),
        company: raw.shipping_company || undefined,
        addressAddition: raw.shipping_address_addition || raw.shipping_addition || undefined,
        phone: raw.shipping_phone || raw.billing_phone || undefined,
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

      // Determine the best carrier_key
      let carrierKey = carrier.toUpperCase()

      // If we have raw payload, try to extract the carrier key
      if (rawOrder && rawOrder.carrier_key) {
        const payloadCarrierKey = rawOrder.carrier_key
        // Verify if it matches the general carrier type (e.g. HERMES matches HERMES_KLV, DHL matches DHL_STD_NATIONAL)
        if (
          (carrier.toUpperCase() === 'HERMES' && payloadCarrierKey.toUpperCase().includes('HERMES')) ||
          (carrier.toUpperCase() === 'DHL' && payloadCarrierKey.toUpperCase().includes('DHL'))
        ) {
          carrierKey = payloadCarrierKey
        }
      }

      // If we couldn't match from the raw payload, fall back to country-specific carrier keys
      if (carrierKey === 'HERMES' || carrierKey === 'DHL') {
        const countryCode = (rawOrder?.shipping_country_code || rawOrder?.shipping?.country_code || 'DE').toUpperCase()
        if (carrierKey === 'HERMES') {
          if (countryCode === 'AT') {
            carrierKey = 'HERMES_POST_AUT'
          } else {
            carrierKey = 'HERMES_KLV' // Default to Germany
          }
        } else if (carrierKey === 'DHL') {
          if (countryCode === 'AT') {
            carrierKey = 'DHL_AT'
          } else if (countryCode === 'NL') {
            carrierKey = 'DHL_NL'
          } else if (countryCode === 'BE') {
            carrierKey = 'DHL_BPOST_BEL'
          } else if (countryCode === 'ES') {
            carrierKey = 'DS_TB_ES'
          } else if (countryCode === 'IT') {
            carrierKey = 'DS_TB_IT'
          } else if (countryCode === 'SE') {
            carrierKey = 'UB_DHL_SE'
          } else {
            carrierKey = 'DHL_STD_NATIONAL' // Default to Germany
          }
        }
      }

      const shipmentPayload = {
        items: [
          {
            order_items: orderItemIds,
            carrier_key: carrierKey,
            shipment_tracking_key: trackingNumber,
            return_tracking_key: returnTrackingNumber || ""
          }
        ]
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

  /**
   * Fetches the official invoice PDF from About You
   */
  async getInvoice(marketplaceOrderId: string): Promise<Buffer> {
    console.log(`[AboutYouAdapter] Fetching invoice for ${marketplaceOrderId}...`)
    const url = `${this.baseUrl}/orders/${marketplaceOrderId}/invoice`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': this.config.apiKey,
        'Accept': 'application/pdf'
      }
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`About You API Fehler beim Rechnungs-Abruf: ${response.status} - ${errText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  async refundOrder(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: any
  ): Promise<boolean> {
    console.log(`[AboutYouAdapter] Processing return/refund for order ${marketplaceOrderId}...`)
    
    try {
      const rawOrder = rawOrderPayload
      if (!rawOrder || !rawOrder.order_items) {
        throw new Error(`Keine order_items für Bestellung ${marketplaceOrderId} im Payload gefunden.`)
      }

      const orderItemIdsToReturn: (string | number)[] = []
      const availableItems = [...rawOrder.order_items]

      for (const refundItem of refundItems) {
        let neededQty = refundItem.quantity
        // 1. Strict SKU match
        for (let i = 0; i < availableItems.length; i++) {
          const item = availableItems[i]
          const itemSku = item?.sku || 'UNKNOWN'
          if (item && itemSku === refundItem.sku && neededQty > 0) {
            orderItemIdsToReturn.push(item.order_item_id || item.id)
            neededQty -= 1
            availableItems[i] = null // Mark as used
          }
        }
        
        // 2. Fallback: If strict match failed (e.g. because of typos/casing), grab ANY available item
        if (neededQty > 0) {
          for (let i = 0; i < availableItems.length; i++) {
            const item = availableItems[i]
            if (item && neededQty > 0) {
              orderItemIdsToReturn.push(item.order_item_id || item.id)
              neededQty -= 1
              availableItems[i] = null // Mark as used
            }
          }
        }

        if (neededQty > 0) {
          console.warn(`[AboutYouAdapter] Not enough lines found for SKU ${refundItem.sku}. Missing: ${neededQty}`)
        }
      }

      if (orderItemIdsToReturn.length === 0) {
         throw new Error(`Konnte keine passenden Artikel (SKUs) in der AboutYou Bestellung ${marketplaceOrderId} finden.`)
      }

      const payloadItem: any = {
        order_items: orderItemIdsToReturn
      }
      
      const trackingKey = rawOrder.return_tracking_number || rawOrder.return_tracking_key
      if (trackingKey && trackingKey.trim() !== '') {
        payloadItem.return_tracking_key = trackingKey
      } else {
        payloadItem.return_tracking_key = 'NOT_PROVIDED'
      }

      const returnPayload = {
        items: [payloadItem]
      }

      const response = await fetch(`${this.baseUrl}/orders/return`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.config.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(returnPayload)
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`About You API Fehler beim Erstatten: ${response.status} - ${errText}`)
      }

      console.log(`[AboutYouAdapter] Return/Refund reported successfully for ${marketplaceOrderId}`)
      return true
    } catch (error) {
      console.error('[AboutYouAdapter] Error confirming return:', error)
      throw error
    }
  }

  async fetchProducts(
    companyId: string,
    onProgress?: (progress: number, total: number, message: string) => Promise<void>
  ): Promise<import('./base').MarketplaceProduct[]> {
    console.log(`[AboutYouAdapter] Fetching products for company ${companyId}...`)
    try {
      const allProducts: any[] = []
      let nextUrl: string | null = `${this.baseUrl}/products?per_page=100`

      const brandMap = new Map<number, string>()
      try {
        const brandsResponse = await fetch(`${this.baseUrl}/brands`, {
          method: 'GET',
          headers: {
            'X-API-Key': this.config.apiKey,
            'Accept': 'application/json'
          }
        })
        if (brandsResponse.ok) {
           const brandsData = await brandsResponse.json()
           if (Array.isArray(brandsData)) {
             for (const b of brandsData) {
                if (b.id && b.name) {
                  brandMap.set(b.id, b.name)
                }
             }
           }
        }
      } catch (e) {
        console.warn(`[AboutYouAdapter] Failed to fetch brands mapping:`, e)
      }

      let pageCount = 0
      while (nextUrl) {
        pageCount++
        console.log(`[AboutYouAdapter] Fetching products page: ${nextUrl}`)
        const response: Response = await fetch(nextUrl, {
          method: 'GET',
          headers: {
            'X-API-Key': this.config.apiKey,
            'Accept': 'application/json'
          }
        })

        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`[AboutYouAdapter] Failed to fetch products: ${response.status} - ${errText}`)
        }

        const data = await response.json()
        const items = data.items || []
        
        // Prevent infinite loop if API keeps returning same cursor but no items
        if (items.length === 0) {
          break
        }

        allProducts.push(...items)
        console.log(`[AboutYouAdapter] Fetched ${items.length} raw products in this page (total so far: ${allProducts.length}).`)

        if (onProgress) {
          const totalItems = data.pagination?.total || allProducts.length
          await onProgress(
            allProducts.length,
            totalItems,
            `Lade Daten von About You... (Seite ${pageCount}, ${allProducts.length} von ${totalItems} Produkten)`
          )
        }

        // Pagination for AboutYou API is typically cursor-based
        if (data.pagination) {
          if (data.pagination.next) {
            nextUrl = data.pagination.next.startsWith('http') 
              ? data.pagination.next 
              : new URL(data.pagination.next, this.baseUrl).toString()
          } else if (data.pagination.next_cursor) {
            nextUrl = `${this.baseUrl}/products?per_page=100&cursor=${data.pagination.next_cursor}`
          } else {
            nextUrl = null
          }
        } else {
          nextUrl = null
        }
      }

      return allProducts.map((p: any) => {
        let priceValue: number | undefined = undefined
        if (p.prices && p.prices.length > 0) {
          // Find DE price if exists, otherwise first price
          const priceObj = p.prices.find((pr: any) => pr.country_code === 'DE') || p.prices[0]
          if (priceObj) {
            const currentPrice = priceObj.sale_price || priceObj.retail_price
            if (currentPrice) {
              priceValue = currentPrice // Prices are already floats like 35.89, not cents
            }
          }
        }

        // Map brand ID to brand name if possible
        let mappedBrand = p.brand;
        if (typeof p.brand === 'number' && brandMap.has(p.brand)) {
           mappedBrand = {
              id: p.brand,
              name: brandMap.get(p.brand)
           }
        }

        return {
          marketplaceProductId: p.sku || p.ean || p.id?.toString(),
          sku: p.sku || p.ean || p.id?.toString() || 'UNKNOWN',
          title: p.name || p.sku || p.ean || 'About You Product',
          price: priceValue,
          stock: p.quantity ?? p.quantity_fbm ?? undefined,
          rawPayload: {
            ...p,
            brand: mappedBrand
          }
        }
      })
    } catch (error) {
      console.error(`[AboutYouAdapter] Error fetching products:`, error)
      throw error
    }
  }

  async updateListings(
    companyId: string, 
    updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number }[]
  ): Promise<void> {
    console.log(`[AboutYouAdapter] Simulating update listings for company ${companyId}:`, updates)
  }
}

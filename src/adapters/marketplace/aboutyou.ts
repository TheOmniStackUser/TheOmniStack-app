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
        cache: 'no-store',
        headers: {
          'X-API-Key': this.config.apiKey,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(15000)
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
            // About You has no HERMES carrier registered for Austria (only DHL_AT and DHL_POST_AUT exist).
            // About You strictly requires: "All items must have the same carrier as the order".
            carrierKey = rawOrder?.carrier_key || 'DHL_AT'
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

      // Fallback: If rawOrder specifies a carrier and our carrierKey is generic, honor the order's carrier
      if (rawOrder?.carrier_key && (carrierKey === 'HERMES' || carrierKey === 'DHL')) {
        carrierKey = rawOrder.carrier_key
      }

      // Ensure return_tracking_key is never empty (About You API requires min_length: 1)
      const returnKey = (returnTrackingNumber && returnTrackingNumber.trim() !== '')
        ? returnTrackingNumber.trim()
        : (rawOrder?.return_tracking_key || rawOrder?.return_tracking_number || trackingNumber)

      const shipmentPayload = {
        items: [
          {
            order_items: orderItemIds,
            carrier_key: carrierKey,
            shipment_tracking_key: trackingNumber,
            return_tracking_key: returnKey
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
      cache: 'no-store',
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
      cache: 'no-store',
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
        cache: 'no-store',
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
          cache: 'no-store',
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
          cache: 'no-store',
          headers: {
            'X-API-Key': this.config.apiKey,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(15000)
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
    updates: { 
      sku: string; 
      marketplaceProductId?: string; 
      stock?: number; 
      price?: number; 
      reducedPrice?: number; 
      fallbackPrice?: number; 
      msrp?: number; 
      [key: string]: any 
    }[]
  ): Promise<{
    totalSent: number
    successes: number
    failures: { sku: string; error: string }[]
    details: { sku: string; status: 'success' | 'error'; error?: string; retail_price?: number; sale_price?: number | null }[]
  }> {
    if (!updates || updates.length === 0) {
      return { totalSent: 0, successes: 0, failures: [], details: [] }
    }

    console.log(`[AboutYouAdapter] Updating listings for company ${companyId}:`, updates.length, 'items')
    try {
      const stockItems: any[] = []
      const priceItems: any[] = []

      for (const u of updates) {
        const sku = u.marketplaceProductId || u.sku
        if (!sku) continue

        if (u.stock !== undefined && u.stock !== null) {
          stockItems.push({
            sku,
            quantity: Math.max(0, Math.floor(Number(u.stock)))
          })
        }

        const hasPriceUpdate = (u.price !== undefined && u.price !== null) ||
                               (u.reducedPrice !== undefined && u.reducedPrice !== null)

        if (hasPriceUpdate) {
          const retailPrice = u.price !== undefined && u.price !== null && Number(u.price) > 0
            ? Number(u.price)
            : (u.reducedPrice !== undefined && u.reducedPrice !== null ? Number(u.reducedPrice) : undefined)

          const salePrice = (u.reducedPrice !== undefined && u.reducedPrice !== null && Number(u.reducedPrice) > 0 && Number(u.reducedPrice) < (retailPrice || Infinity))
            ? Number(u.reducedPrice)
            : null

          if (retailPrice !== undefined) {
            priceItems.push({
              sku,
              price: {
                country_code: 'DE',
                currency: 'EUR',
                retail_price: retailPrice,
                sale_price: salePrice,
              }
            })
          }
        }
      }

      const postChunkSize = 100 // reduced to prevent whole-batch rejections on About You side
      const successes: { sku: string; retail_price?: number; sale_price?: number | null }[] = []
      const failures: { sku: string; error: string }[] = []
      const details: { sku: string; status: 'success' | 'error'; error?: string; retail_price?: number; sale_price?: number | null }[] = []

      // 1. Update Stocks
      if (stockItems.length > 0) {
        console.log(`[AboutYouAdapter] Pushing ${stockItems.length} stock updates...`)
        for (let i = 0; i < stockItems.length; i += postChunkSize) {
          const chunk = stockItems.slice(i, i + postChunkSize)
          const res = await fetch(`${this.baseUrl}/products/stocks`, {
            method: 'PUT',
            headers: {
              'X-API-Key': this.config.apiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ items: chunk })
          })

          if (!res.ok) {
            const errText = await res.text()
            console.error(`[AboutYouAdapter] Stock update failed: ${res.status} - ${errText}`)
            throw new Error(`About You API Fehler beim Bestandsabgleich: ${res.status} - ${errText}`)
          }
          const result = await res.json()
          console.log(`[AboutYouAdapter] Stock update accepted, batchRequestId:`, result.batchRequestId || result)

          if (result.batchRequestId) {
            await this.pollStockBatchResults(result.batchRequestId)
          }
        }
      }

      // 2. Update Prices
      if (priceItems.length > 0) {
        console.log(`[AboutYouAdapter] Pushing ${priceItems.length} price updates...`)
        for (let i = 0; i < priceItems.length; i += postChunkSize) {
          const chunk = priceItems.slice(i, i + postChunkSize)
          const res = await fetch(`${this.baseUrl}/products/prices`, {
            method: 'PUT',
            headers: {
              'X-API-Key': this.config.apiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ items: chunk })
          })

          if (!res.ok) {
            const errText = await res.text()
            console.error(`[AboutYouAdapter] Price update failed: ${res.status} - ${errText}`)
            throw new Error(`About You API Fehler beim Preisabgleich: ${res.status} - ${errText}`)
          }
          const result = await res.json()
          console.log(`[AboutYouAdapter] Price update accepted, batchRequestId:`, result.batchRequestId)

          if (result.batchRequestId) {
            const batchOutcome = await this.pollPriceBatchResults(result.batchRequestId, chunk)
            successes.push(...batchOutcome.successes)
            failures.push(...batchOutcome.failures)
            details.push(...batchOutcome.details)
          } else {
            for (const item of chunk) {
              successes.push({ sku: item.sku, retail_price: item.price.retail_price, sale_price: item.price.sale_price })
              details.push({ sku: item.sku, status: 'success', retail_price: item.price.retail_price, sale_price: item.price.sale_price })
            }
          }
        }
      }

      console.log(`[AboutYouAdapter] Finished update: ${successes.length} succeeded, ${failures.length} failed.`)

      if (priceItems.length > 0 && successes.length === 0 && failures.length > 0) {
        throw new Error(`About You Preisaktualisierung für alle ${failures.length} Artikel fehlgeschlagen: ${failures.map(f => `${f.sku}: ${f.error}`).join('; ')}`)
      }

      return {
        totalSent: priceItems.length > 0 ? priceItems.length : stockItems.length,
        successes: successes.length,
        failures,
        details
      }
    } catch (error) {
      console.error(`[AboutYouAdapter] Error updating listings:`, error)
      throw error
    }
  }

  private async pollPriceBatchResults(
    batchRequestId: string,
    chunk: any[]
  ): Promise<{
    successes: { sku: string; retail_price?: number; sale_price?: number | null }[]
    failures: { sku: string; error: string }[]
    details: { sku: string; status: 'success' | 'error'; error?: string; retail_price?: number; sale_price?: number | null }[]
  }> {
    const successes: { sku: string; retail_price?: number; sale_price?: number | null }[] = []
    const failures: { sku: string; error: string }[] = []
    const details: { sku: string; status: 'success' | 'error'; error?: string; retail_price?: number; sale_price?: number | null }[] = []

    const maxAttempts = 30 // 30 * 1.5s = ~45s
    const delayMs = 1500

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, delayMs))

      try {
        const res = await fetch(`${this.baseUrl}/results/prices?batch_request_id=${batchRequestId}`, {
          headers: {
            'X-API-Key': this.config.apiKey,
            'Accept': 'application/json'
          }
        })

        if (!res.ok) {
          console.warn(`[AboutYouAdapter] Poll attempt ${attempt} returned status ${res.status}`)
          continue
        }

        const data = await res.json()
        const status = data.status

        if (status === 'completed' || status === 'failed') {
          console.log(`[AboutYouAdapter] Price batch ${batchRequestId} finished with status: ${status}`)
          const items = data.items || []

          for (const it of items) {
            const sku = it.requestItem?.sku
            if (!sku) continue

            const retailPrice = it.requestItem?.price?.retail_price
            const salePrice = it.requestItem?.price?.sale_price

            if (it.success) {
              successes.push({ sku, retail_price: retailPrice, sale_price: salePrice })
              details.push({ sku, status: 'success', retail_price: retailPrice, sale_price: salePrice })
            } else {
              const errMsg = (it.errors && it.errors.length > 0) ? it.errors.join(', ') : 'Von About You abgelehnt'
              failures.push({ sku, error: errMsg })
              details.push({ sku, status: 'error', error: errMsg, retail_price: retailPrice, sale_price: salePrice })
            }
          }

          // Check if any items in chunk were not explicitly in items array
          const returnedSkus = new Set(items.map((it: any) => it.requestItem?.sku).filter(Boolean))
          for (const originalItem of chunk) {
            if (!returnedSkus.has(originalItem.sku)) {
              if (status === 'completed') {
                successes.push({ sku: originalItem.sku, retail_price: originalItem.price?.retail_price, sale_price: originalItem.price?.sale_price })
                details.push({ sku: originalItem.sku, status: 'success', retail_price: originalItem.price?.retail_price, sale_price: originalItem.price?.sale_price })
              } else {
                failures.push({ sku: originalItem.sku, error: 'Batch processing failed' })
                details.push({ sku: originalItem.sku, status: 'error', error: 'Batch processing failed' })
              }
            }
          }

          return { successes, failures, details }
        }
      } catch (pollErr: any) {
        console.warn(`[AboutYouAdapter] Error polling batch ${batchRequestId} on attempt ${attempt}:`, pollErr.message)
      }
    }

    console.warn(`[AboutYouAdapter] Polling timed out for batch ${batchRequestId}. Assuming items applied.`)
    for (const item of chunk) {
      successes.push({ sku: item.sku, retail_price: item.price?.retail_price, sale_price: item.price?.sale_price })
      details.push({ sku: item.sku, status: 'success', retail_price: item.price?.retail_price, sale_price: item.price?.sale_price })
    }

    return { successes, failures, details }
  }

  private async pollStockBatchResults(batchRequestId: string): Promise<void> {
    const maxAttempts = 15
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 1500))
      try {
        const res = await fetch(`${this.baseUrl}/results/stocks?batch_request_id=${batchRequestId}`, {
          headers: {
            'X-API-Key': this.config.apiKey,
            'Accept': 'application/json'
          }
        })
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'completed' || data.status === 'failed') {
            console.log(`[AboutYouAdapter] Stock batch ${batchRequestId} completed with status: ${data.status}`)
            return
          }
        }
      } catch (e: any) {
        console.warn(`[AboutYouAdapter] Error polling stock batch ${batchRequestId}:`, e.message)
      }
    }
  }
}

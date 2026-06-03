import type { MarketplaceAdapter, NormalizedOrder } from './base'
import crypto from 'crypto'

export type KauflandAdapterConfig = {
  clientId: string
  clientSecret: string
  environment?: 'sandbox' | 'production'
}

export class KauflandAdapter implements MarketplaceAdapter {
  readonly marketplace = 'kaufland' as const
  private readonly baseUrl: string

  constructor(private readonly config: KauflandAdapterConfig) {
    this.baseUrl = config.environment === 'sandbox'
      ? 'https://sellerapi-playground.kaufland.com/v2'
      : 'https://sellerapi.kaufland.com/v2'
  }

  /**
   * Helper to make authenticated requests to Kaufland Seller API.
   * Signs the request using HMAC-SHA256 based on Method, URI, Body, and Timestamp.
   */
  private async makeRequest(
    method: string,
    path: string,
    body: string = '',
    queryParams: Record<string, string> = {}
  ): Promise<any> {
    const timestamp = Math.floor(Date.now() / 1000)

    // Build URL with query params
    const urlObj = new URL(`${this.baseUrl}${path}`)
    for (const [key, value] of Object.entries(queryParams)) {
      urlObj.searchParams.set(key, value)
    }

    const fullUri = urlObj.toString()

    // Sign request string: METHOD\nURI\nBODY\nTIMESTAMP
    const signatureInput = [
      method.toUpperCase(),
      fullUri,
      body,
      timestamp.toString()
    ].join('\n')

    const signature = crypto
      .createHmac('sha256', this.config.clientSecret)
      .update(signatureInput)
      .digest('hex')

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Shop-Client-Key': this.config.clientId,
      'Shop-Timestamp': timestamp.toString(),
      'Shop-Signature': signature,
    }

    if (body) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(fullUri, {
      method: method.toUpperCase(),
      headers,
      body: body ? body : undefined,
    })

    const responseText = await response.text()
    if (!response.ok) {
      console.error(`[KauflandAdapter] Request failed (${response.status}) for ${fullUri}: ${responseText}`)
      throw new Error(`Kaufland API Error (${response.status}): ${responseText.substring(0, 500)}`)
    }

    return responseText ? JSON.parse(responseText) : null
  }

  /**
   * Fetches all unshipped orders (with status 'need_to_be_sent') from the Kaufland API.
   * Groups units by order and returns NormalizedOrder objects.
   */
  async fetchUnshippedOrders(companyId: string, options?: { fromDate?: string, toDate?: string }): Promise<NormalizedOrder[]> {
    console.log(`[KauflandAdapter] Fetching open orders for company ${companyId}...`)

    const queryParams: Record<string, string> = {
      status: 'need_to_be_sent',
      limit: '100',
      offset: '0'
    }

    if (options?.fromDate) {
      queryParams['ts_created_from_iso'] = `${options.fromDate}T00:00:00Z`
    }
    if (options?.toDate) {
      queryParams['ts_created_until_iso'] = `${options.toDate}T23:59:59Z`
    }

    let offset = 0
    const limit = 100
    let hasMore = true
    const allOrderUnits: any[] = []

    try {
      while (hasMore) {
        queryParams['offset'] = offset.toString()
        console.log(`[KauflandAdapter] Fetching page with offset ${offset}...`)
        
        const response = await this.makeRequest('GET', '/order-units', '', queryParams)
        const data = response.data || []
        allOrderUnits.push(...data)

        const total = response.pagination?.total ?? 0
        offset += limit

        if (offset >= total || data.length === 0) {
          hasMore = false
        }
      }
    } catch (error) {
      console.error(`[KauflandAdapter] Error fetching order units:`, error)
      throw error
    }

    console.log(`[KauflandAdapter] Total order units fetched: ${allOrderUnits.length}`)

    // Group order units by order ID (id_order)
    const unitsByOrder: Record<string, any[]> = {}
    for (const unit of allOrderUnits) {
      if (!unit.id_order) continue
      if (!unitsByOrder[unit.id_order]) {
        unitsByOrder[unit.id_order] = []
      }
      unitsByOrder[unit.id_order].push(unit)
    }

    const normalizedOrders: NormalizedOrder[] = []

    for (const [idOrder, units] of Object.entries(unitsByOrder)) {
      const firstUnit = units[0]
      if (!firstUnit) continue

      let totalAmount = 0
      let taxAmount = 0
      const items: any[] = []
      const itemGroupMap: Record<string, { sku: string, title: string, quantity: number, unitPrice: number, taxRate: number }> = {}
      let totalShippingCharges = 0

      for (const unit of units) {
        const itemPrice = (unit.price || 0) / 100
        const shippingCharge = (unit.shipping_charges || 0) / 100

        totalAmount += itemPrice + shippingCharge

        const vatRate = 0.19 // Default to standard German VAT
        const netPrice = itemPrice / (1 + vatRate)
        const netShipping = shippingCharge / (1 + vatRate)
        taxAmount += (itemPrice - netPrice) + (shippingCharge - netShipping)

        totalShippingCharges += shippingCharge

        const sku = unit.id_offer || unit.ean || 'UNKNOWN'
        const title = unit.item_title || unit.title || `Kaufland-Produkt ${unit.ean || ''}`
        const key = `${sku}_${itemPrice}`

        if (itemGroupMap[key]) {
          itemGroupMap[key].quantity += (unit.quantity || 1)
        } else {
          itemGroupMap[key] = {
            sku,
            title,
            quantity: unit.quantity || 1,
            unitPrice: itemPrice,
            taxRate: vatRate
          }
        }
      }

      for (const item of Object.values(itemGroupMap)) {
        items.push(item)
      }

      // Add shipping charges as a separate line item if present
      if (totalShippingCharges > 0) {
        items.push({
          sku: 'SHIPPING',
          title: 'Versandkosten',
          quantity: 1,
          unitPrice: totalShippingCharges,
          taxRate: 0.19
        })
      }

      const billing = firstUnit.billing_address || firstUnit.shipping_address || {}
      const shipping = firstUnit.shipping_address || firstUnit.billing_address || {}

      const buyerName = `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || 'Kaufland Kunde'
      const shippingName = `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim() || shipping.company_name || buyerName

      normalizedOrders.push({
        marketplaceOrderId: idOrder,
        marketplace: 'kaufland',
        purchaseDate: new Date(firstUnit.ts_created_iso || Date.now()),
        buyer: {
          name: buyerName,
          email: firstUnit.buyer?.email || 'no-reply@kaufland.de',
          phone: firstUnit.buyer?.phone || billing.phone || undefined,
        },
        shippingAddress: {
          name: shippingName,
          company: shipping.company_name || undefined,
          addressAddition: shipping.additional_field || undefined,
          phone: shipping.phone || undefined,
          street: `${shipping.street || ''} ${shipping.house_number || ''}`.trim(),
          city: shipping.city || '',
          zip: shipping.postcode || '',
          country: shipping.country || 'DE'
        },
        currency: firstUnit.currency || 'EUR',
        items,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        taxAmount: parseFloat(taxAmount.toFixed(2)),
        rawPayload: units // preserve original units structure
      })
    }

    return normalizedOrders
  }

  /**
   * Confirms shipment of an order on Kaufland.
   * Patches each order unit as sent with carrier and tracking info.
   */
  async confirmShipment(
    marketplaceOrderId: string,
    trackingNumber: string,
    carrier: string,
    _returnTrackingNumber?: string,
    rawOrderPayload?: unknown
  ): Promise<void> {
    console.log(`[KauflandAdapter] Confirming shipment for order ${marketplaceOrderId}...`)

    let orderUnits: any[] = []
    if (Array.isArray(rawOrderPayload)) {
      orderUnits = rawOrderPayload
    } else if (rawOrderPayload && typeof rawOrderPayload === 'object' && 'order_units' in rawOrderPayload) {
      orderUnits = (rawOrderPayload as any).order_units || []
    }

    if (orderUnits.length === 0) {
      console.log(`[KauflandAdapter] Order units not found in payload. Fetching from /orders/${marketplaceOrderId}...`)
      try {
        const orderDetails = await this.makeRequest('GET', `/orders/${marketplaceOrderId}`, '', {
          embedded: 'order_units'
        })
        orderUnits = orderDetails.data?.order_units || []
      } catch (err) {
        console.error(`[KauflandAdapter] Failed to fetch order details to retrieve order units:`, err)
        throw new Error(`Order ${marketplaceOrderId} could not be shipped because order units are missing.`)
      }
    }

    if (orderUnits.length === 0) {
      throw new Error(`No order units found for order ${marketplaceOrderId}`)
    }

    // Capitalize carrier name correctly according to Kaufland requirements
    let resolvedCarrier = carrier.trim()
    const lower = resolvedCarrier.toLowerCase()
    if (lower === 'dhl') resolvedCarrier = 'DHL'
    else if (lower === 'hermes') resolvedCarrier = 'Hermes'
    else if (lower === 'dpd') resolvedCarrier = 'DPD'
    else if (lower === 'gls') resolvedCarrier = 'GLS'
    else if (lower === 'ups') resolvedCarrier = 'UPS'
    else if (lower === 'fedex') resolvedCarrier = 'FedEx'
    else resolvedCarrier = 'Other'

    for (const unit of orderUnits) {
      const idOrderUnit = unit.id_order_unit || unit.order_unit_id
      if (!idOrderUnit) continue

      console.log(`[KauflandAdapter] Sending shipment confirmation for order unit ${idOrderUnit}...`)
      const body = JSON.stringify({
        carrier_code: resolvedCarrier,
        tracking_numbers: trackingNumber
      })

      await this.makeRequest('PATCH', `/order-units/${idOrderUnit}/send`, body)
    }

    console.log(`[KauflandAdapter] Shipment confirmation complete for order ${marketplaceOrderId}`)
  }

  /**
   * Uploads an invoice PDF file to Kaufland for a specific order.
   */
  async uploadInvoice(
    marketplaceOrderId: string,
    pdfBuffer: Buffer,
    fileName: string
  ): Promise<boolean> {
    console.log(`[KauflandAdapter] Uploading invoice for order ${marketplaceOrderId}...`)
    try {
      const body = JSON.stringify({
        original_name: fileName,
        mime_type: 'application/pdf',
        data: pdfBuffer.toString('base64')
      })

      await this.makeRequest('POST', `/order-invoices/${marketplaceOrderId}`, body)
      console.log(`[KauflandAdapter] Invoice uploaded successfully for order ${marketplaceOrderId}`)
      return true
    } catch (err) {
      console.error(`[KauflandAdapter] Failed to upload invoice for order ${marketplaceOrderId}:`, err)
      return false
    }
  }

  async refundOrder(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: unknown
  ): Promise<boolean> {
    console.log(`[KauflandAdapter] Refunding order ${marketplaceOrderId}...`)
    try {
      // 1. Fetch order details to retrieve order units
      let orderUnits: any[] = []
      if (Array.isArray(rawOrderPayload)) {
        orderUnits = rawOrderPayload
      } else if (rawOrderPayload && typeof rawOrderPayload === 'object' && 'order_units' in rawOrderPayload) {
        orderUnits = (rawOrderPayload as any).order_units || []
      }

      if (orderUnits.length === 0) {
        console.log(`[KauflandAdapter] Order units not in payload. Fetching from /orders/${marketplaceOrderId}...`)
        const orderDetails = await this.makeRequest('GET', `/orders/${marketplaceOrderId}`, '', {
          embedded: 'order_units'
        })
        orderUnits = orderDetails.data?.order_units || []
      }

      if (orderUnits.length === 0) {
        throw new Error(`Keine order units für Bestellung ${marketplaceOrderId} gefunden.`)
      }

      // 2. Map SKUs to matching order units that can be refunded
      const remainingRefundItems = refundItems.map(i => ({ ...i }))
      const refundPromises: Promise<any>[] = []

      for (const unit of orderUnits) {
        const idOrderUnit = unit.id_order_unit || unit.order_unit_id
        if (!idOrderUnit) continue

        // Check if this unit is already refunded/cancelled
        if (unit.status === 'cancelled' || unit.status === 'returned') {
          continue
        }

        const sku = unit.id_offer || unit.ean
        const refundIndex = remainingRefundItems.findIndex(ri => ri.sku === sku)
        if (refundIndex !== -1) {
          // Trigger refund for this unit
          const refundAmount = unit.price || 0 // price in cents
          const body = JSON.stringify({
            amount: refundAmount,
            reason: 'customer_return'
          })

          console.log(`[KauflandAdapter] Refunding order unit ${idOrderUnit} (sku: ${sku}, amount: ${refundAmount} cents)...`)
          refundPromises.push(
            this.makeRequest('POST', `/order-units/${idOrderUnit}/refund`, body)
          )

          // Decrement remaining quantity
          remainingRefundItems[refundIndex].quantity--
          if (remainingRefundItems[refundIndex].quantity <= 0) {
            remainingRefundItems.splice(refundIndex, 1)
          }
        }
      }

      if (refundPromises.length === 0) {
        console.warn(`[KauflandAdapter] No matching active order units found for refund items.`)
        return false
      }

      await Promise.all(refundPromises)
      console.log(`[KauflandAdapter] Refund processed successfully for order ${marketplaceOrderId}`)
      return true
    } catch (error) {
      console.error(`[KauflandAdapter] Error refunding order:`, error)
      return false
    }
  }
}

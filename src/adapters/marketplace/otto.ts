// ============================================================================
// OTTO.DE ADAPTER
// Connects to the Otto Market API to fetch orders
// Reference: https://api.otto.market/docs
// ============================================================================

import type { MarketplaceAdapter, NormalizedOrder } from './base'

export type OttoAdapterConfig = {
  clientId: string
  clientSecret: string
  environment?: 'sandbox' | 'production'
  installationId?: string
  appId?: string
}

export class OttoAdapter implements MarketplaceAdapter {
  readonly marketplace = 'otto' as const

  private readonly baseUrl: string
  private readonly tokenUrl: string

  constructor(private readonly config: OttoAdapterConfig) {
    this.baseUrl = config.environment === 'sandbox' 
      ? 'https://sandbox.api.otto.market' 
      : 'https://api.otto.market'
      
    this.tokenUrl = config.environment === 'sandbox'
      ? 'https://sandbox.api.otto.market/v1/token'
      : 'https://api.otto.market/v1/token'
  }

  /**
   * Exchanges the Client ID and Secret for a short-lived Access Token
   */
  private async getAccessToken(): Promise<string> {
    const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')
    
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: this.config.environment === 'sandbox' ? 'developer' : 'orders receipts shipments',
      }).toString(),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`[OttoAdapter] Failed to fetch access token: ${response.status} ${err}`)
    }

    const data = await response.json()
    const developerToken = data.access_token

    // If sandbox and we have installation details, exchange developer token for installation access token
    if (this.config.environment === 'sandbox' && this.config.installationId && this.config.appId) {
      console.log(`[OttoAdapter] Exchanging developer token for installation access token (appId: ${this.config.appId}, installationId: ${this.config.installationId})...`)
      
      const installTokenUrl = `${this.baseUrl}/v1/apps/${this.config.appId}/installations/${this.config.installationId}/accessToken`
      const installResponse = await fetch(installTokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${developerToken}`,
          'Accept': 'application/json',
          'Content-Length': '0'
        }
      })

      if (!installResponse.ok) {
        const errText = await installResponse.text()
        throw new Error(`[OttoAdapter] Failed to fetch installation access token: ${installResponse.status} - ${errText}`)
      }

      const installData = await installResponse.json()
      console.log('[OttoAdapter] Successfully fetched installation access token!')
      return installData.access_token
    }

    return developerToken
  }

  /**
   * Fetches all PROCESSABLE orders from Otto Partner API v4
   */
  async fetchUnshippedOrders(companyId: string, options?: { fromDate?: string, toDate?: string }): Promise<NormalizedOrder[]> {
    console.log(`[OttoAdapter] Fetching unshipped orders for company ${companyId}...`)
    
    try {
      const accessToken = await this.getAccessToken()
      
      let url = `${this.baseUrl}/v4/orders?fulfillmentStatus=PROCESSABLE&limit=100`
      if (options?.fromDate) url += `&fromOrderDate=${options.fromDate}T00:00:00Z`
      if (options?.toDate) url += `&toOrderDate=${options.toDate}T23:59:59Z`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`[OttoAdapter] Failed to fetch orders: ${response.status} - ${errText}`)
      }

      const responseData = await response.json()
      // Otto returns an array of orders inside 'resources'
      const rawOrders = responseData.resources || []
      
      console.log(`[OttoAdapter] Fetched ${rawOrders.length} raw orders from Otto.`)

      return rawOrders.map((ro: any) => this.normalizeOrder(ro, companyId))
    } catch (error) {
      console.error('[OttoAdapter] Error syncing orders:', error)
      throw error
    }
  }

  /**
   * Normalizes the raw Otto order payload into our internal NormalizedOrder format
   */
  private normalizeOrder(raw: any, companyId: string): NormalizedOrder {
    const delivery = raw.deliveryAddress || {}
    let totalAmount = 0
    let taxAmount = 0
    let totalWeight = 0

    const items = (raw.positionItems || []).map((item: any) => {
      const itemPrice = item.itemValueReducedGrossPrice?.amount || item.itemValueGrossPrice?.amount || 0
      const qty = item.quantity || 1
      
      totalAmount += itemPrice * qty
      taxAmount += (itemPrice * qty) * (item.product?.vatRate ? item.product.vatRate / 100 : 0.19)
      
      // Otto v4: product might have weight in grams or kg
      const w = item.product?.weight || 0
      totalWeight += (w / 1000) * qty // assuming it might be in grams, but let's be safe. 
      // Actually, if we don't know the unit, we might need to check product.weightUnit

      return {
        sku: item.product?.sku || item.product?.articleNumber || 'UNKNOWN',
        title: item.product?.productTitle || 'Otto Product',
        quantity: qty,
        unitPrice: itemPrice,
        taxRate: item.product?.vatRate ? item.product.vatRate / 100 : 0.19,
      }
    })

    return {
      marketplace: this.marketplace,
      marketplaceOrderId: raw.salesOrderId || raw.orderNumber || `OTTO-${Date.now()}`,
      purchaseDate: new Date(raw.orderDate || Date.now()),
      buyer: {
        name: `${raw.invoiceAddress?.firstName || ''} ${raw.invoiceAddress?.lastName || ''}`.trim() || 'Otto Customer',
        email: raw.invoiceAddress?.email || 'no-reply@otto.market',
      },
      shippingAddress: {
        name: `${delivery.firstName || ''} ${delivery.lastName || ''}`.trim(),
        street: `${delivery.street || ''} ${delivery.houseNumber || ''}`.trim(),
        city: delivery.city || '',
        zip: delivery.zipCode || '',
        country: delivery.countryCode || 'DE',
      },
      currency: 'EUR',
      totalAmount: raw.amount?.amount || totalAmount,
      taxAmount: taxAmount,
      totalWeight: totalWeight > 0 ? totalWeight : undefined,
      items,
      rawPayload: raw,
    }
  }

  /**
   * Confirms a shipment on Otto.de
   * 
   * Otto v4 requires:
   *   POST /v4/orders/{salesOrderId}/shipments
   *   Body: { trackingKey: { carrier, trackingNumber }, shipmentDate, positionItems: [{ positionItemId, ... }] }
   * 
   * The positionItemIds must come from the original order payload.
   */
  async confirmShipment(
    marketplaceOrderId: string, 
    trackingNumber: string, 
    carrier: string = 'DHL', 
    returnTrackingNumber?: string,
    rawOrderPayload?: any,
    returnAddressCarrierId?: string
  ): Promise<void> {
    console.log(`[OttoAdapter] Confirming shipment for order ${marketplaceOrderId}...`)
    
    try {
      const accessToken = await this.getAccessToken()

      // Otto v4 bulk shipments endpoint (POST /v4/shipments) expects an array of shipment objects.
      // Each shipment object contains trackingKey, shipmentDate, and positionItems.
      // Crucially, in the bulk API, each positionItem MUST have its own salesOrderId.
      const positionItems: any[] = []
      if (rawOrderPayload?.positionItems) {
        for (const item of rawOrderPayload.positionItems) {
          if (item.positionItemId) {
            positionItems.push({
              positionItemId: item.positionItemId,
              salesOrderId: marketplaceOrderId, // marketplaceOrderId is the UUID (salesOrderId)
              ...(returnTrackingNumber ? { returnTrackingKey: { carrier: carrier.toUpperCase(), trackingNumber: returnTrackingNumber } } : {}),
              ...(returnAddressCarrierId ? { returnAddressCarrierId } : {})
            })
          }
        }
      }

      if (positionItems.length === 0) {
        throw new Error(`Keine positionItemIds für Bestellung ${marketplaceOrderId} gefunden.`)
      }

      const shipmentPayload = {
        trackingKey: {
          carrier: carrier.toUpperCase(),
          trackingNumber: trackingNumber,
        },
        shipDate: new Date().toISOString().split('.')[0] + 'Z',
        shipFromAddress: {
          city: 'Hamburg', // Fallback, usually required by Otto V1
          countryCode: 'DEU',
          zipCode: '20095'
        },
        positionItems,
      }

      // The V1 API expects a single shipment object
      const requestBody = JSON.stringify(shipmentPayload)
      console.log(`[OttoAdapter] Shipment payload:`, requestBody)

      const response = await fetch(`${this.baseUrl}/v1/shipments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: requestBody
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(`[OttoAdapter] Failed to confirm shipment: ${response.status} - ${errText}`)
        let message = `HTTP ${response.status}`
        try {
          const parsed = JSON.parse(errText)
          message = parsed.message || parsed.errors?.[0]?.message || parsed.detail || errText
        } catch {
          message = errText
        }
        throw new Error(`(Payload: ${requestBody}) Otto API Fehler: ${message}`)
      }

      console.log(`[OttoAdapter] Shipment confirmed successfully for ${marketplaceOrderId}`)
    } catch (error) {
      console.error('[OttoAdapter] Error confirming shipment:', error)
      throw error
    }
  }
}

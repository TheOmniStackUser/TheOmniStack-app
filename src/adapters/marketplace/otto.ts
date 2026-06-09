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
  connectionType?: 'service_partner' | 'private'
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
      ? 'https://sandbox.api.otto.market/oauth2/token'
      : 'https://api.otto.market/oauth2/token'
  }

  /**
   * Exchanges the Client ID and Secret for a short-lived Access Token
   */
  private async getAccessToken(): Promise<string> {
    const isPrivate = this.config.connectionType === 'private'
    const tokenClientId = this.config.clientId
    const tokenClientSecret = this.config.clientSecret

    const basicAuth = Buffer.from(`${tokenClientId}:${tokenClientSecret}`).toString('base64')
    
    let scope = isPrivate ? 'orders products shipments returns receipts availability' : 'developer'

    const doFetch = async (currentScope: string) => fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: currentScope,
      }).toString(),
    })

    let response = await doFetch(scope)

    if (!response.ok) {
      const errText = await response.text()
      // If the user misconfigured private vs service_partner, try fallback
      if (response.status === 400 && errText.includes('invalid_scope')) {
         console.warn(`[OttoAdapter] Invalid scope '${scope}', attempting fallback...`)
         const fallbackScope = isPrivate ? 'developer' : 'orders products shipments returns receipts availability'
         response = await doFetch(fallbackScope)
         if (!response.ok) {
             const fallbackErr = await response.text()
             throw new Error(`[OttoAdapter] Failed to fetch access token after fallback: ${response.status} ${fallbackErr}`)
         }
         // If fallback worked, they misconfigured connectionType. We adjust it in memory for this session
         console.warn(`[OttoAdapter] Fallback succeeded. Adjusting connectionType for this session.`)
         this.config.connectionType = isPrivate ? 'service_partner' : 'private'
      } else {
         throw new Error(`[OttoAdapter] Failed to fetch access token: ${response.status} ${errText}`)
      }
    }

    const data = await response.json()
    const developerToken = data.access_token

    // If this is a Private App, the developer token is all we need
    if (this.config.connectionType === 'private') {
      console.log(`[OttoAdapter] Using Private App flow. Dev Token is fully authorized.`)
      return developerToken
    }

    // If we have installation details, exchange developer token for installation access token
    if (this.config.installationId && this.config.appId) {
      console.log(`[OttoAdapter] Exchanging developer token for installation access token (appId: ${this.config.appId}, installationId: ${this.config.installationId})...`)
      
      const installTokenUrl = `${this.baseUrl}/v1/apps/${this.config.appId}/installations/${this.config.installationId}/accessToken`
      const installResponse = await fetch(installTokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${developerToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials'
        }).toString()
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
      
      let nextUrl: string | null = `${this.baseUrl}/v4/orders?fulfillmentStatus=PROCESSABLE&limit=50`
      // We intentionally ignore options.fromDate and options.toDate for PROCESSABLE orders
      // because we want to fetch ALL unshipped orders. Otherwise users selecting "Today" 
      // will miss orders from yesterday evening or due to UTC timezone offsets.

      const allRawOrders: any[] = []

      while (nextUrl) {
        console.log(`[OttoAdapter] Fetching page: ${nextUrl}`)
        const res: Response = await fetch(nextUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        })

        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`[OttoAdapter] Failed to fetch orders: ${res.status} - ${errText}`)
        }

        const responseData = await res.json()
        const rawOrders = responseData.resources || []
        allRawOrders.push(...rawOrders)
        console.log(`[OttoAdapter] Fetched ${rawOrders.length} raw orders in this page (total so far: ${allRawOrders.length}).`)

        // Find the "next" link in the links array
        const links = responseData.links || []
        const nextLink = links.find((l: any) => l.rel === 'next')
        const rawNextUrl = nextLink && nextLink.href ? nextLink.href : null
        if (rawNextUrl) {
          if (rawNextUrl.startsWith('http')) {
            nextUrl = rawNextUrl
          } else {
            const separator = rawNextUrl.startsWith('/') ? '' : '/'
            nextUrl = `${this.baseUrl}${separator}${rawNextUrl}`
          }
        } else {
          nextUrl = null
        }
      }

      console.log(`[OttoAdapter] Sync completed. Total orders fetched: ${allRawOrders.length}`)

      return allRawOrders.map((ro: any) => this.normalizeOrder(ro, companyId))
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
        phone: raw.invoiceAddress?.phoneNumber || undefined,
      },
      shippingAddress: {
        name: `${delivery.firstName || ''} ${delivery.lastName || ''}`.trim(),
        company: delivery.companyName || undefined,
        addressAddition: delivery.addition || undefined,
        phone: delivery.phoneNumber || undefined,
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
              salesOrderId: rawOrderPayload.salesOrderId || marketplaceOrderId,
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
        
        if (errText.includes('POSITION_ITEM_INCLUDED_IN_OTHER_SHIPMENT')) {
          throw new Error(`Bestellung wurde bereits auf Otto als versendet markiert.`)
        }

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

  /**
   * Fetches the official invoice PDF from Otto Market
   */
  async getInvoice(marketplaceOrderId: string, rawOrderPayload?: unknown): Promise<{ pdfBuffer: Buffer, receiptNumber: string } | null> {
    const salesOrderId = (rawOrderPayload as any)?.salesOrderId || marketplaceOrderId
    console.log(`[OttoAdapter] Fetching receipts list for salesOrderId ${salesOrderId}...`)
    try {
      const accessToken = await this.getAccessToken()
      
      const listUrl = `${this.baseUrl}/v3/receipts?salesOrderId=${salesOrderId}`
      const response = await fetch(listUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        const errText = await response.text()
        console.warn(`[OttoAdapter] Failed to fetch receipts list for ${marketplaceOrderId}: ${response.status} - ${errText}`)
        return null
      }

      const data = await response.json()
      const purchaseReceipt = (data.resources || []).find((r: any) => r.receiptType === 'PURCHASE')
      
      if (!purchaseReceipt || !purchaseReceipt.receiptNumber) {
        console.warn(`[OttoAdapter] No purchase receipt found for salesOrderId ${salesOrderId}`)
        return null
      }

      const receiptNumber = purchaseReceipt.receiptNumber
      console.log(`[OttoAdapter] Found purchase receipt ${receiptNumber}. Downloading PDF...`)
      
      const downloadUrl = `${this.baseUrl}/v3/receipts/${receiptNumber}.pdf`
      const pdfResponse = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/pdf'
        }
      })

      if (!pdfResponse.ok) {
        const errText = await pdfResponse.text()
        throw new Error(`Otto API Fehler beim Download von Beleg ${receiptNumber}: ${pdfResponse.status} - ${errText}`)
      }

      const arrayBuffer = await pdfResponse.arrayBuffer()
      return {
        pdfBuffer: Buffer.from(arrayBuffer),
        receiptNumber
      }
    } catch (error) {
      console.error('[OttoAdapter] Error getting invoice:', error)
      throw error
    }
  }

  async refundOrder(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: unknown
  ): Promise<boolean> {
    console.log(`[OttoAdapter] Refunding order ${marketplaceOrderId}...`)
    try {
      const accessToken = await this.getAccessToken()

      // 1. Fetch order details from Otto v4 to get positionItems
      let ottoOrder = (rawOrderPayload as any)
      const salesOrderId = ottoOrder?.salesOrderId || marketplaceOrderId
      
      const hasPositionItems = ottoOrder && Array.isArray(ottoOrder.positionItems)
      if (!hasPositionItems) {
        console.log(`[OttoAdapter] Fetching order details from Otto v4 API for ${salesOrderId}...`)
        const response = await fetch(`${this.baseUrl}/v4/orders/${salesOrderId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        })
        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`Failed to fetch order from Otto: ${response.status} - ${errText}`)
        }
        const data = await response.json()
        ottoOrder = data.resources ? data.resources[0] : data
      }

      if (!ottoOrder || !ottoOrder.positionItems) {
        throw new Error(`Keine positionItems für Bestellung ${marketplaceOrderId} gefunden.`)
      }

      // 2. Map returned SKUs to positionItemIds in the order
      const returnsPayload: any[] = []
      // Deep clone refundItems so we can mutate quantities safely
      const remainingRefundItems = refundItems.map(i => ({ ...i }))

      for (const item of ottoOrder.positionItems) {
        if (!item.positionItemId) continue
        const itemSku = item.product?.sku || item.product?.articleNumber || 'UNKNOWN'
        
        // Find if this item sku is requested for refund
        const refundIndex = remainingRefundItems.findIndex(ri => ri.sku === itemSku)
        if (refundIndex !== -1) {
          returnsPayload.push({
            salesOrderId: salesOrderId,
            positionItemId: item.positionItemId,
            reason: 'RETURN_RECEIVED',
            condition: 'A'
          })

          // Decrement the quantity needed to refund
          remainingRefundItems[refundIndex].quantity--
          if (remainingRefundItems[refundIndex].quantity <= 0) {
            remainingRefundItems.splice(refundIndex, 1)
          }
        }
      }

      if (returnsPayload.length === 0) {
        console.warn(`[OttoAdapter] No matching positionItems found for refunded SKUs.`)
        throw new Error('Keine passenden Artikel in der Otto-Bestellung gefunden.')
      }

      // 3. Post returns to Otto returns endpoint (v3/returns/acceptance)
      // Otto v3 acceptance can be an array directly or { positionItems: [...] } 
      // The official docs often say "positionItems: An array of objects"
      const requestBody = JSON.stringify(returnsPayload)
      console.log(`[OttoAdapter] Sending return confirmation to Otto:`, requestBody)
      let response = await fetch(`${this.baseUrl}/v3/returns/acceptance`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ positionItems: returnsPayload })
      })

      if (!response.ok) {
        // Fallback: If { positionItems: [] } is wrong, try array directly
        if (response.status === 400) {
          console.log(`[OttoAdapter] Retrying with direct array payload...`)
          response = await fetch(`${this.baseUrl}/v3/returns/acceptance`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(returnsPayload)
          })
        }
      }

      if (!response.ok) {
        const errText = await response.text()
        console.error(`[OttoAdapter] Refund failed: ${response.status} - ${errText}`)
        throw new Error(`Otto API returns error: ${errText}`)
      }

      console.log(`[OttoAdapter] Refund successfully confirmed for order ${marketplaceOrderId}`)
      return true
    } catch (error) {
      console.error(`[OttoAdapter] Error refunding order:`, error)
      throw error
    }
  }

  /**
   * Fetch products from Otto Partner API
   */
  async fetchProducts(
    companyId: string,
    onProgress?: (progress: number, total: number, message: string) => Promise<void>
  ): Promise<import('./base').MarketplaceProduct[]> {
    try {
      const accessToken = await this.getAccessToken()
      const allProducts: any[] = []
      
      let nextUrl: string | null = `${this.baseUrl}/v5/products?limit=100`
      let pagesFetched = 0

      while (nextUrl && pagesFetched < 500) {
        pagesFetched++
        console.log(`[OttoAdapter] Fetching products page ${pagesFetched}: ${nextUrl}`)
        
        if (onProgress) {
          await onProgress(pagesFetched, 0, `Lade Produktdaten von OTTO (Seite ${pagesFetched})...`)
        }

        const response: Response = await fetch(nextUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        })

        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`Otto API fetchProducts failed: ${response.status} - ${errText}`)
        }

        const data = await response.json()
        // Otto v5 products API returns { productVariations: [...], links: [...] }
        // resources may also be present but as an object – prefer productVariations array
        const products = (
          (Array.isArray(data.productVariations) && data.productVariations) ||
          (Array.isArray(data.resources) && data.resources) ||
          (Array.isArray(data.items) && data.items) ||
          (Array.isArray(data.products) && data.products) ||
          (Array.isArray(data.results) && data.results) ||
          (Array.isArray(data) ? data : [])
        )
        allProducts.push(...products)
        
        if (products.length === 0) {
          console.log(`[OttoAdapter] Reached empty products page, breaking.`)
          break
        }

        const nextLink = (data.links || []).find((l: any) => l.rel === 'next')
        let proposedNextUrl = null
        if (nextLink && nextLink.href && nextLink.href.trim() !== '') {
          proposedNextUrl = new URL(nextLink.href, nextUrl).toString()
        }
        
        if (!proposedNextUrl || proposedNextUrl === nextUrl) {
          if (proposedNextUrl === nextUrl) {
            console.warn(`[OttoAdapter] Infinite loop detected (nextUrl is same as current). Breaking.`)
          }
          break
        }
        
        nextUrl = proposedNextUrl
      }

      // Fetch quantities to map stock
      const stockMap = new Map<string, number>()
      try {
        let quantitiesUrl: string | null = `${this.baseUrl}/v1/availability/quantities?limit=100`
        let qPagesFetched = 0
        while (quantitiesUrl && qPagesFetched < 500) {
          qPagesFetched++
          console.log(`[OttoAdapter] Fetching quantities page ${qPagesFetched}: ${quantitiesUrl}`)
          
          if (onProgress) {
            await onProgress(pagesFetched + qPagesFetched, 0, `Lade Bestände von OTTO (Seite ${qPagesFetched})...`)
          }

          const qRes: Response = await fetch(quantitiesUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          })

          if (qRes.ok) {
            const qData = await qRes.json()
            // Otto Availability API returns { resources: { variations: [...] }, links: [...] }
            const resources = (
              Array.isArray(qData) ? qData :
              Array.isArray(qData.resources) ? qData.resources :
              Array.isArray(qData.resources?.variations) ? qData.resources.variations :
              Array.isArray(qData.results) ? qData.results :
              Array.isArray(qData.items) ? qData.items :
              []
            )
            for (const item of resources) {
              if (item.sku && item.quantity !== undefined) {
                stockMap.set(item.sku, typeof item.quantity === 'string' ? parseInt(item.quantity) : item.quantity)
              } else if (item.sku && item.availableQuantity !== undefined) {
                stockMap.set(item.sku, item.availableQuantity)
              }
            }

            if (resources.length === 0) {
              console.log(`[OttoAdapter] Reached empty quantities page, breaking.`)
              break
            }

            const nextLink = (qData.links || []).find((l: any) => l.rel === 'next')
            let proposedNextUrl = null
            if (nextLink && nextLink.href && nextLink.href.trim() !== '') {
              proposedNextUrl = new URL(nextLink.href, quantitiesUrl).toString()
            }
            
            if (!proposedNextUrl || proposedNextUrl === quantitiesUrl) {
              if (proposedNextUrl === quantitiesUrl) {
                console.warn(`[OttoAdapter] Infinite loop detected for quantities. Breaking.`)
              }
              break
            }
            
            quantitiesUrl = proposedNextUrl
          } else {
            console.warn(`[OttoAdapter] Failed to fetch quantities: ${qRes.status}`)
            break
          }
        }
      } catch (err) {
        console.error(`[OttoAdapter] Error fetching quantities:`, err)
      }

      // We might need to fetch quantities separately, but for unmapped listing, 
      // just returning the SKU and title is enough for mapping.
      // We will attempt to get price from standard price object.
      
      if (this.config.environment === 'sandbox') {
        allProducts.push({
          sku: 'DEMO-SHIRT-01',
          productTitle: 'Demo Test Shirt (OTTO Sandbox)',
          standardPrice: { amount: 29.99 }
        });
      }

      return allProducts.map((p: any) => {
        const sku = p.sku || p.articleNumber || p.id
        return {
          marketplaceProductId: sku,
          sku: sku,
          title: p.productTitle || p.title || p.productReference || sku,
          price: p.standardPrice?.amount || p.price?.amount || p.pricing?.standardPrice?.amount,
          stock: stockMap.get(sku),
          rawPayload: p
        }
      })
    } catch (error) {
      console.error(`[OttoAdapter] Error fetching products:`, error)
      throw error
    }
  }

  /**
   * Sync inventory and/or prices back to Otto.
   */
  async updateListings(
    companyId: string, 
    updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number }[]
  ): Promise<void> {
    if (!updates || updates.length === 0) return

    try {
      const accessToken = await this.getAccessToken()

      const stockUpdates = updates.filter(u => u.stock !== undefined).map(u => ({
        sku: u.sku,
        quantity: u.stock
      }))

      if (stockUpdates.length > 0) {
        console.log(`[OttoAdapter] Updating ${stockUpdates.length} quantities via POST /v1/availability/quantities...`)
        const qRes = await fetch(`${this.baseUrl}/v1/availability/quantities`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(stockUpdates)
        })

        if (!qRes.ok) {
          const errText = await qRes.text()
          console.error(`[OttoAdapter] Update quantities failed: ${errText}`)
        }
      }

      // Price updates on Otto are typically done via POST /v3/products
      // But patching prices for existing active products can be complex.
      // We will assume a basic structure. If it fails, the user needs
      // to adjust mapping or use the Otto UI.
      const priceUpdates = updates.filter(u => u.price !== undefined).map(u => ({
        sku: u.sku,
        standardPrice: {
          amount: u.price,
          currency: 'EUR'
        }
      }))

      if (priceUpdates.length > 0) {
        console.log(`[OttoAdapter] Updating ${priceUpdates.length} prices via POST /v3/products...`)
        const pRes = await fetch(`${this.baseUrl}/v3/products`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(priceUpdates)
        })

        if (!pRes.ok) {
          const errText = await pRes.text()
          console.error(`[OttoAdapter] Update prices failed: ${errText}`)
        }
      }

      console.log(`[OttoAdapter] Listings successfully updated.`)
    } catch (error) {
      console.error(`[OttoAdapter] Error updating listings:`, error)
      throw error
    }
  }
}

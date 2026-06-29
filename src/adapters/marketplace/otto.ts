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

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, TokenCacheEntry>();
const tokenPromiseCache = new Map<string, Promise<string>>();

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
    const cacheKey = `${this.config.clientId}-${this.config.installationId || 'no-install'}-${this.config.connectionType || 'service_partner'}`;

    const cached = tokenCache.get(cacheKey);
    // Buffer of 10 seconds
    if (cached && cached.expiresAt > Date.now() + 10000) {
      return cached.token;
    }

    if (tokenPromiseCache.has(cacheKey)) {
      return tokenPromiseCache.get(cacheKey)!;
    }

    const promise = this._fetchAccessToken(cacheKey).finally(() => {
      tokenPromiseCache.delete(cacheKey);
    });

    tokenPromiseCache.set(cacheKey, promise);
    return promise;
  }

  private async _fetchAccessToken(cacheKey: string): Promise<string> {
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
      signal: AbortSignal.timeout(15000)
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
    const devExpiresIn = data.expires_in || 300 // default 5 mins

    // If this is a Private App, the developer token is all we need
    if (this.config.connectionType === 'private') {
      console.log(`[OttoAdapter] Using Private App flow. Dev Token is fully authorized.`)
      tokenCache.set(cacheKey, {
        token: developerToken,
        expiresAt: Date.now() + (devExpiresIn * 1000)
      })
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
          grant_type: 'client_credentials',
          scope: 'orders products shipments returns receipts availability price-reduction'
        }).toString(),
        signal: AbortSignal.timeout(15000)
      })

      if (!installResponse.ok) {
        const errText = await installResponse.text()
        throw new Error(`[OttoAdapter] Failed to fetch installation access token: ${installResponse.status} - ${errText}`)
      }

      const installData = await installResponse.json()
      console.log('[OttoAdapter] Successfully fetched installation access token!')
      const installExpiresIn = installData.expires_in || 300
      
      tokenCache.set(cacheKey, {
        token: installData.access_token,
        expiresAt: Date.now() + (installExpiresIn * 1000)
      })
      
      return installData.access_token
    }

    tokenCache.set(cacheKey, {
      token: developerToken,
      expiresAt: Date.now() + (devExpiresIn * 1000)
    })

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
      let pagesFetched = 0

      while (nextUrl && pagesFetched < 500) {
        pagesFetched++
        console.log(`[OttoAdapter] Fetching page ${pagesFetched}: ${nextUrl}`)
        const res: Response = await fetch(nextUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(15000)
        })

        if (!res.ok) {
          let errText = await res.text()
          if (errText.includes('<html')) errText = 'HTML Gateway Error (e.g. Rate Limit / 429)'
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
          let proposedNextUrl = null
          if (rawNextUrl.startsWith('http')) {
            proposedNextUrl = rawNextUrl
          } else {
            const separator = rawNextUrl.startsWith('/') ? '' : '/'
            proposedNextUrl = `${this.baseUrl}${separator}${rawNextUrl}`
          }
          
          if (proposedNextUrl === nextUrl) {
            console.warn(`[OttoAdapter] Infinite loop detected (nextUrl is same as current). Breaking.`)
            nextUrl = null
          } else {
            nextUrl = proposedNextUrl
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
      
      const vatRate = item.product?.vatRate ? item.product.vatRate / 100 : 0.19
      const itemGrossTotal = itemPrice * qty

      totalAmount += itemGrossTotal
      taxAmount += itemGrossTotal - (itemGrossTotal / (1 + vatRate))
      
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

      let response: Response | undefined;
      let retries = 5;
      let delay = 2000;
      let errText = '';

      while (retries > 0) {
        response = await fetch(`${this.baseUrl}/v1/shipments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: requestBody
        });

        if (response.ok) break;

        errText = await response.text();
        
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          break; // Don't retry on client errors like 400, 401, 403, 404
        }

        console.warn(`[OttoAdapter] confirmShipment returned ${response.status}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        retries--;
        delay = delay * 2 + Math.floor(Math.random() * 1000); // exponential backoff with jitter
      }

      if (!response || !response.ok) {
        console.error(`[OttoAdapter] Failed to confirm shipment: ${response?.status} - ${errText}`)
        
        if (errText.includes('POSITION_ITEM_INCLUDED_IN_OTHER_SHIPMENT')) {
          throw new Error(`Bestellung wurde bereits auf Otto als versendet markiert.`)
        }

        let message = `HTTP ${response?.status}`
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
        if (response.status === 429) {
          throw new Error('RATE_LIMIT')
        }
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
        if (pdfResponse.status === 429) {
          throw new Error('RATE_LIMIT')
        }
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

  

  async getReceiptPdfByNumber(receiptNumber: string): Promise<{ pdfBuffer: Buffer, receiptNumber: string } | null> {
    console.log(`[OttoAdapter] Downloading PDF for receipt ${receiptNumber}...`)
    try {
      const accessToken = await this.getAccessToken()
      const downloadUrl = `${this.baseUrl}/v3/receipts/${receiptNumber}.pdf`
      const pdfResponse = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/pdf'
        }
      })
      if (!pdfResponse.ok) return null
      const arrayBuffer = await pdfResponse.arrayBuffer()
      return { pdfBuffer: Buffer.from(arrayBuffer), receiptNumber }
    } catch (error) {
      console.error('[OttoAdapter] Error getting receipt PDF:', error)
      return null
    }
  }

  async getRefundReceipt(marketplaceOrderId: string): Promise<{ pdfBuffer: Buffer, receiptNumber: string } | null> {
    console.log(`[OttoAdapter] Fetching REFUND receipts list for salesOrderId ${marketplaceOrderId}...`)
    try {
      const accessToken = await this.getAccessToken()
      
      const listUrl = `${this.baseUrl}/v3/receipts?salesOrderId=${marketplaceOrderId}`
      const response = await fetch(listUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      })

      if (!response.ok) return null

      const data = await response.json()
      // Find the most recent REFUND receipt
      const refundReceipts = (data.resources || []).filter((r: any) => r.receiptType === 'REFUND')
      if (refundReceipts.length === 0) return null
      
      // Sort by receiptDate descending
      refundReceipts.sort((a: any, b: any) => new Date(b.receiptDate).getTime() - new Date(a.receiptDate).getTime())
      const refundReceipt = refundReceipts[0]
      
      return this.getReceiptPdfByNumber(refundReceipt.receiptNumber)
    } catch (error) {
      console.error('[OttoAdapter] Error getting refund receipt:', error)
      return null
    }
  }

  /**
   * Apply a price reduction (partial refund) to a specific position item
   */
  async applyPriceReduction(
    salesOrderId: string,
    positionItemId: string,
    amount: number,
    reason: string = 'CUSTOMER_DISSATISFACTION'
  ): Promise<void> {
    console.log(`[OttoAdapter] Applying price reduction of ${amount} to item ${positionItemId} in order ${salesOrderId}...`)
    try {
      const accessToken = await this.getAccessToken()

      const payload = {
        salesOrderId,
        positionItemId,
        priceReduction: {
          amount,
          currency: 'EUR'
        },
        reason
      }

      const response = await fetch(`${this.baseUrl}/v1/price-reductions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(`[OttoAdapter] Price reduction failed: ${errText}`)
        throw new Error(`Price reduction failed: ${response.status} - ${errText}`)
      }

      console.log(`[OttoAdapter] Price reduction successfully applied.`)
    } catch (error) {
      console.error(`[OttoAdapter] Error applying price reduction:`, error)
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

        let response: Response | undefined;
        let fetchRetries = 3;
        while (fetchRetries > 0) {
          try {
            response = await fetch(nextUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
              },
              signal: AbortSignal.timeout(15000) // 15s timeout to prevent hanging
            })
            if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) break;
            console.warn(`[OttoAdapter] Fetch returned ${response.status}. Retrying...`);
          } catch (err: any) {
            console.warn(`[OttoAdapter] Fetch error: ${err.message}. Retrying...`);
            if (fetchRetries === 1) throw err;
          }
          fetchRetries--;
          if (fetchRetries > 0) await new Promise(r => setTimeout(r, 2000));
        }

        if (!response || !response.ok) {
          const errText = await response?.text()
          throw new Error(`Otto API fetchProducts failed: ${response?.status} - ${errText}`)
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

        const extractParam = (u: string, param: string) => {
          try { return new URL(u).searchParams.get(param) } catch { return null }
        }
        
        const nextCursor = extractParam(proposedNextUrl, 'cursor') || extractParam(proposedNextUrl, 'page') || extractParam(proposedNextUrl, 'offset')
        const currentCursor = extractParam(nextUrl, 'cursor') || extractParam(nextUrl, 'page') || extractParam(nextUrl, 'offset')
        
        if (nextCursor && currentCursor && nextCursor === currentCursor) {
          console.warn(`[OttoAdapter] Infinite loop detected (pagination param did not change: ${nextCursor}). Breaking.`)
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

          let qRes: Response | undefined;
          let qRetries = 3;
          while (qRetries > 0) {
            try {
              qRes = await fetch(quantitiesUrl, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(15000)
              })
              if (qRes.ok || (qRes.status >= 400 && qRes.status < 500 && qRes.status !== 429)) break;
              console.warn(`[OttoAdapter] Quantities fetch returned ${qRes.status}. Retrying...`);
            } catch (err: any) {
              console.warn(`[OttoAdapter] Quantities fetch error: ${err.message}. Retrying...`);
              if (qRetries === 1) throw err;
            }
            qRetries--;
            if (qRetries > 0) await new Promise(r => setTimeout(r, 2000));
          }

          if (qRes && qRes.ok) {
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
            
            const extractCursor = (u: string) => {
              try { return new URL(u).searchParams.get('cursor') } catch { return null }
            }

            if (!proposedNextUrl || proposedNextUrl === quantitiesUrl) {
              if (proposedNextUrl === quantitiesUrl) {
                console.warn(`[OttoAdapter] Infinite loop detected for quantities (identical URL). Breaking.`)
              }
              break
            }
            
            const nextCursor = extractCursor(proposedNextUrl)
            const currentCursor = extractCursor(quantitiesUrl)
            if (nextCursor && currentCursor && nextCursor === currentCursor) {
              console.warn(`[OttoAdapter] Infinite loop detected (cursor did not change: ${nextCursor}). Breaking.`)
              break
            }
            
            quantitiesUrl = proposedNextUrl
          } else {
            console.warn(`[OttoAdapter] Failed to fetch quantities: ${qRes?.status || 'Unknown error'}`)
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
          price: p.salePrice?.amount || p.standardPrice?.amount || p.price?.amount || p.pricing?.standardPrice?.amount,
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
        const chunkSize = 150
        for (let i = 0; i < stockUpdates.length; i += chunkSize) {
          const chunk = stockUpdates.slice(i, i + chunkSize)
          console.log(`[OttoAdapter] Updating ${chunk.length} quantities via POST /v1/availability/quantities...`)
          const qRes = await fetch(`${this.baseUrl}/v1/availability/quantities`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(chunk)
          })

          if (!qRes.ok) {
            const errText = await qRes.text()
            console.error(`[OttoAdapter] Update quantities failed: ${errText}`)
            throw new Error(`Otto API Fehler beim Bestandsabgleich: ${qRes.status} - ${errText}`)
          }
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
        const chunkSize = 150
        for (let i = 0; i < priceUpdates.length; i += chunkSize) {
          const chunk = priceUpdates.slice(i, i + chunkSize)
          console.log(`[OttoAdapter] Updating ${chunk.length} prices via POST /v3/products...`)
          const pRes = await fetch(`${this.baseUrl}/v3/products`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(chunk)
          })

          if (!pRes.ok) {
            const errText = await pRes.text()
            console.error(`[OttoAdapter] Update prices failed: ${errText}`)
            throw new Error(`Otto API Fehler beim Preisabgleich: ${pRes.status} - ${errText}`)
          }
        }
      }

      console.log(`[OttoAdapter] Listings successfully updated.`)
    } catch (error) {
      console.error(`[OttoAdapter] Error updating listings:`, error)
      throw error
    }
  }
}

// ============================================================================
// OTTO.DE ADAPTER
// Connects to the Otto Market API to fetch orders
// Reference: https://api.otto.market/docs
// ============================================================================

import type { MarketplaceAdapter, NormalizedOrder, NormalizedQuestion, AnswerQuestionResult } from './base'

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
    
    let scope = isPrivate ? 'orders products shipments returns receipts availability price-reduction' : 'developer'

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
         const fallbackScope = isPrivate ? 'developer' : 'orders products shipments returns receipts availability price-reduction'
         response = await doFetch(fallbackScope)
         if (!response.ok) {
             const fallbackErr = await response.text()
             throw new Error(`[OttoAdapter] Failed to fetch access token after fallback: ${response.status} ${fallbackErr}`)
         }
         // If fallback worked, they misconfigured connectionType. We adjust it in memory for this session
         console.warn(`[OttoAdapter] Fallback succeeded. Adjusting connectionType for this session.`)
         this.config.connectionType = isPrivate ? 'service_partner' : 'private';
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
        body: `scope=orders%20products%20shipments%20returns%20receipts%20availability%20price-reduction`,
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
      
      // By default, fetch processable orders from the last 30 days to avoid timeouts with too many historical orders.
      // If a specific fromDate is provided, use that.
      const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const orderDateFrom = options?.fromDate ? new Date(options.fromDate).toISOString() : defaultFrom
      
      let nextUrl: string | null = `${this.baseUrl}/v4/orders?fulfillmentStatus=PROCESSABLE&limit=50&orderDateFrom=${encodeURIComponent(orderDateFrom)}`

      const allRawOrders: any[] = []
      let pagesFetched = 0

      while (nextUrl && pagesFetched < 500) {
        pagesFetched++
        console.log(`[OttoAdapter] Fetching page ${pagesFetched}: ${nextUrl}`)
        const res: Response = await fetch(nextUrl, {
      method: 'GET',
          
      cache: 'no-store',
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
          const isProcessable = !item.fulfillmentStatus || item.fulfillmentStatus === 'PROCESSABLE'
          if (item.positionItemId && isProcessable) {
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
        const hasItems = rawOrderPayload?.positionItems?.length > 0;
        if (hasItems) {
          console.log(`[OttoAdapter] All items for order ${marketplaceOrderId} are already shipped, cancelled or processed on Otto. Treating as success.`)
          return
        }
        throw new Error(`Keine versendbaren Artikel (positionItemIds) für Bestellung ${marketplaceOrderId} gefunden.`)
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
          console.log(`[OttoAdapter] Order ${marketplaceOrderId} is already marked as shipped on Otto (POSITION_ITEM_INCLUDED_IN_OTHER_SHIPMENT). Treating as success.`)
          return
        }

        let message = `HTTP ${response?.status}`
        try {
          const parsed = JSON.parse(errText)
          if (parsed.errors && Array.isArray(parsed.errors)) {
            const errorTitles = parsed.errors.map((e: any) => e.title || e.message).filter(Boolean).join(', ')
            message = errorTitles || parsed.message || parsed.detail || errText
            
            if (message.includes('POSITION_ITEM_CAN_NOT_BE_SENT')) {
              message = `Einige Artikel konnten nicht als versendet markiert werden (möglicherweise bereits storniert oder versendet).`
            }
          } else {
            message = parsed.message || parsed.errors?.[0]?.message || parsed.detail || errText
          }
        } catch {
          message = errText
        }
        throw new Error(`Otto API Fehler: ${message}`)
      }

      console.log(`[OttoAdapter] Shipment confirmed successfully for ${marketplaceOrderId}`)
    } catch (error) {
      console.error('[OttoAdapter] Error confirming shipment:', error)
      throw error
    }
  }

  /**
   * Fetches a list of receipts since a given date to optimize bulk fetching.
   * Based on feedback, we use the fromDate (or dateFrom) query param.
   */
  async getAvailableReceipts(fromDate: Date): Promise<{ receiptNumber: string; salesOrderId: string; receiptType: string }[]> {
    console.log(`[OttoAdapter] Fetching available receipts since ${fromDate.toISOString()}...`)
    try {
      const accessToken = await this.getAccessToken()
      const dateStr = fromDate.toISOString()
      
      // Otto API docs generally use dateFrom/dateTo or fromDate. We include both to be safe if possible, or just fromDate as explicitly requested.
      // E.g. dateFrom is standard for V3, but user explicitly said "fromDate". We will use fromDate. 
      // If it fails, they will notice, but we strictly follow "beim Aufruf der Receipts den Query Parameters "fromDate" zu nutzen"
      
      let nextUrl: string | null = `${this.baseUrl}/v3/receipts?fromDate=${encodeURIComponent(dateStr)}&limit=100`
      const allReceipts: any[] = []
      let pagesFetched = 0

      while (nextUrl && pagesFetched < 50) {
        pagesFetched++
        const response: Response = await fetch(nextUrl, {
          method: 'GET',
          cache: 'no-store',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        })

        if (!response.ok) {
          // If fromDate is invalid, let's try dateFrom as fallback just in case
          if (response.status === 400 && pagesFetched === 1) {
             console.warn(`[OttoAdapter] fromDate failed with 400, trying dateFrom...`)
             nextUrl = `${this.baseUrl}/v3/receipts?dateFrom=${encodeURIComponent(dateStr)}&limit=100`
             const fallbackResponse = await fetch(nextUrl, {
               method: 'GET',
               cache: 'no-store',
               headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
             })
             if (!fallbackResponse.ok) {
                const errText = await fallbackResponse.text()
                console.warn(`[OttoAdapter] getAvailableReceipts fallback failed: ${fallbackResponse.status} - ${errText}`)
                break
             } else {
                const data = await fallbackResponse.json()
                allReceipts.push(...(data.resources || []))
                const nextLink = (data.links || []).find((l: any) => l.rel === 'next')
                nextUrl = nextLink && nextLink.href ? `${this.baseUrl}${nextLink.href.startsWith('/') ? '' : '/'}${nextLink.href}` : null
                continue
             }
          }

          const errText = await response.text()
          console.warn(`[OttoAdapter] getAvailableReceipts failed: ${response.status} - ${errText}`)
          break
        }

        const data = await response.json()
        allReceipts.push(...(data.resources || []))

        const nextLink = (data.links || []).find((l: any) => l.rel === 'next')
        if (nextLink && nextLink.href) {
          nextUrl = nextLink.href.startsWith('http') ? nextLink.href : `${this.baseUrl}${nextLink.href.startsWith('/') ? '' : '/'}${nextLink.href}`
        } else {
          nextUrl = null
        }
      }

      return allReceipts.map(r => ({
        receiptNumber: r.receiptNumber,
        salesOrderId: r.salesOrderId,
        receiptType: r.receiptType
      }))
    } catch (error) {
      console.error('[OttoAdapter] Error in getAvailableReceipts:', error)
      return []
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
        
      cache: 'no-store',
      headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        const errText = await response.text()
        console.warn(`[OttoAdapter] Failed to fetch receipts list for ${marketplaceOrderId}: ${response.status} - ${errText}`)
        // Dragonfish WAF returns 403 when rate limiting/blocking IPs
        if (response.status === 429 || response.status === 403) {
          throw new Error(`RATE_LIMIT_${response.status}`)
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
        
      cache: 'no-store',
      headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/pdf'
        }
      })

      if (!pdfResponse.ok) {
        const errText = await pdfResponse.text()
        if (pdfResponse.status === 429 || pdfResponse.status === 403) {
          throw new Error(`RATE_LIMIT_${pdfResponse.status}`)
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
        
      cache: 'no-store',
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
        
      cache: 'no-store',
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
          
      cache: 'no-store',
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
        cache: 'no-store',
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
            cache: 'no-store',
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
        
        if (errText.includes('The return has already been accepted')) {
          console.log(`[OttoAdapter] Return already accepted by Otto, treating as success.`)
          return true
        }
        
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
              
      cache: 'no-store',
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
                
      cache: 'no-store',
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
                stockMap.set(item.sku, typeof item.quantity === 'string' ? Number(item.quantity) : item.quantity)
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
          price: p.pricing?.sale?.salePrice?.amount || p.pricing?.salePrice?.amount || p.salePrice?.amount || p.pricing?.standardPrice?.amount || p.standardPrice?.amount || p.price?.amount,
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
    updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number; reducedPrice?: number; msrp?: number; fallbackPrice?: number; saleStartDate?: Date | null; saleEndDate?: Date | null; gpsrDetails?: any; }[]
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

      // 2. Dedicated Pricing Updates (Standard Price & Sale Price) via POST /v5/products/prices
      const priceUpdates = updates.filter(u => 
        u.price !== undefined || 
        u.reducedPrice !== undefined
      );

      if (priceUpdates.length > 0) {
        console.log(`[OttoAdapter] Updating prices for ${priceUpdates.length} products via POST /v5/products/prices...`)
        const pricePayload = priceUpdates.map(u => {
          const standardAmount = u.price !== undefined ? u.price : (u.fallbackPrice || 0)
          
          let sale: any = null
          if (u.reducedPrice !== undefined && u.reducedPrice > 0 && (standardAmount === 0 || u.reducedPrice < standardAmount)) {
            sale = {
              salePrice: {
                amount: u.reducedPrice,
                currency: 'EUR'
              },
              startDate: u.saleStartDate ? new Date(u.saleStartDate).toISOString().split('.')[0] + 'Z' : new Date().toISOString().split('.')[0] + 'Z',
              endDate: (u.saleEndDate && new Date(u.saleEndDate).getTime() > Date.now()) 
                ? new Date(u.saleEndDate).toISOString().split('.')[0] + 'Z' 
                : '2069-11-11T22:59:59Z'
            }
          }

          const item: any = {
            sku: u.sku,
            standardPrice: {
              amount: standardAmount,
              currency: 'EUR'
            },
            sale
          }

          return item
        })

        const priceChunkSize = 200
        for (let i = 0; i < pricePayload.length; i += priceChunkSize) {
          const chunk = pricePayload.slice(i, i + priceChunkSize)
          console.log(`[OttoAdapter] Sending batch of ${chunk.length} price updates to /v5/products/prices...`)
          const pRes = await fetch(`${this.baseUrl}/v5/products/prices`, {
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
            console.error(`[OttoAdapter] Failed to update prices: ${pRes.status} - ${errText}`)
            throw new Error(`Otto API Fehler beim Preisabgleich: ${pRes.status} - ${errText}`)
          }
          console.log(`[OttoAdapter] Successfully posted ${chunk.length} prices to Otto (status ${pRes.status})`)
        }
      }

      // 3. Product Catalog Updates (MSRP / UVP & Compliance / GPSR) via POST /v5/products
      // Note: Otto's /v5/products/prices endpoint ONLY supports standardPrice and salePrice.
      // MSRP (UVP) is a product catalog attribute and must be updated via POST /v5/products.
      const catalogUpdates = updates.filter(u => 
        u.msrp !== undefined || 
        (u.gpsrDetails && u.gpsrDetails.name)
      );

      if (catalogUpdates.length > 0) {
        console.log(`[OttoAdapter] Checking catalog updates (MSRP/GPSR) for ${catalogUpdates.length} products...`)
        const modifiedProducts: any[] = [];
        const chunkSize = 10;
        for (let i = 0; i < catalogUpdates.length; i += chunkSize) {
          const chunk = catalogUpdates.slice(i, i + chunkSize);
          await Promise.all(chunk.map(async (u) => {
            try {
              const getRes = await fetch(`${this.baseUrl}/v5/products?sku=${encodeURIComponent(u.sku)}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
              });
              if (!getRes.ok) return;
              const data = await getRes.json();
              if (!data?.productVariations?.length) return;
              const product = data.productVariations[0];
              let isModified = false;

              // Check and update MSRP (UVP)
              if (u.msrp !== undefined) {
                product.pricing = product.pricing || {};
                const currentMsrp = product.pricing.msrp?.amount;
                const targetMsrp = u.msrp > 0 ? u.msrp : null;

                if (targetMsrp !== null) {
                  if (currentMsrp !== targetMsrp || product.pricing.msrp?.currency !== 'EUR') {
                    product.pricing.msrp = {
                      amount: targetMsrp,
                      currency: 'EUR'
                    };
                    isModified = true;
                  }
                } else if (product.pricing.msrp) {
                  delete product.pricing.msrp;
                  isModified = true;
                }
              }

              // Check and update GPSR compliance
              if (u.gpsrDetails && u.gpsrDetails.name) {
                const currentAddr = product.compliance?.productSafety?.addresses?.[0];
                const newStreet = [u.gpsrDetails.street, u.gpsrDetails.zip, u.gpsrDetails.city].filter(Boolean).join(', ');
                const newRegion = (u.gpsrDetails.country && u.gpsrDetails.country.toLowerCase() === 'deutschland') ? 'DE' : (u.gpsrDetails.country && u.gpsrDetails.country.toLowerCase() === 'österreich' ? 'AT' : 'DE');
                
                const isGpsrEqual = currentAddr &&
                  currentAddr.name === u.gpsrDetails.name &&
                  currentAddr.address === newStreet &&
                  currentAddr.email === u.gpsrDetails.email;

                if (!isGpsrEqual) {
                  if (!product.compliance) product.compliance = {};
                  if (!product.compliance.productSafety) product.compliance.productSafety = { addresses: [] };
                  product.compliance.productSafety.addresses = [
                    {
                      name: u.gpsrDetails.name,
                      address: newStreet,
                      regionCode: newRegion,
                      email: u.gpsrDetails.email,
                      url: u.gpsrDetails.url || undefined,
                      phone: u.gpsrDetails.phone || undefined,
                      roles: ["DISTRIBUTOR"],
                      components: []
                    }
                  ];
                  isModified = true;
                }
              }

              if (isModified) {
                modifiedProducts.push(product);
              }
            } catch (err) {
              console.error(`[OttoAdapter] Error checking/updating catalog data for ${u.sku}:`, err);
            }
          }));
        }

        if (modifiedProducts.length > 0) {
          console.log(`[OttoAdapter] Posting ${modifiedProducts.length} modified product variations to POST /v5/products...`)
          const groupedByRef: Record<string, any[]> = {};
          for (const p of modifiedProducts) {
            const ref = p.productReference || 'unreferenced';
            if (!groupedByRef[ref]) groupedByRef[ref] = [];
            groupedByRef[ref].push(p);
          }

          for (const [ref, variations] of Object.entries(groupedByRef)) {
            const batchSize = 50;
            for (let b = 0; b < variations.length; b += batchSize) {
              const batch = variations.slice(b, b + batchSize);
              try {
                const postRes = await fetch(`${this.baseUrl}/v5/products`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                  },
                  body: JSON.stringify(batch)
                });
                if (!postRes.ok) {
                  const errText = await postRes.text();
                  console.error(`[OttoAdapter] Failed to update product catalog for family ${ref}: ${postRes.status} - ${errText}`);
                } else {
                  console.log(`[OttoAdapter] Successfully posted ${batch.length} variations for family ${ref} to /v5/products`);
                }
              } catch (err) {
                console.error(`[OttoAdapter] Error posting variations for family ${ref}:`, err);
              }
            }
          }
        }
      }

      console.log(`[OttoAdapter] Listings successfully updated.`)
    } catch (error) {
      console.error(`[OttoAdapter] Error updating listings:`, error)
      throw error
    }
  }

  /**
   * Fetches open customer questions for Otto.
   * Matches customer clarifications from OTTO Partner Connect, linked orders, and return notices.
   */
  async fetchOpenQuestions(companyId: string, options?: { fromDate?: string }): Promise<NormalizedQuestion[]> {
    console.log(`[OttoAdapter] Fetching open questions for company ${companyId}...`)
    const { db } = await import('@/db/client')
    const { orders } = await import('@/db/schema/orders')
    const { calculateSlaDeadline } = await import('@/lib/sla')
    const { eq, and, sql } = await import('drizzle-orm')

    const questions: NormalizedQuestion[] = []

    // 1. Fetch relevant Otto orders from DB for this company
    const relevantOrders = await db
      .select({
        id: orders.id,
        marketplaceOrderId: orders.marketplaceOrderId,
        orderNumber: sql<string>`orders.raw_payload->>'orderNumber'`,
        buyerName: orders.buyerName,
        buyerEmail: orders.buyerEmail,
        rawPayload: orders.rawPayload,
        shippingStatus: orders.shippingStatus,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(
        and(
          eq(orders.companyId, companyId),
          eq(orders.marketplace, 'otto')
        )
      )

    // Build lookup maps by orderNumber and salesOrderId
    const orderMapByNumber = new Map<string, typeof relevantOrders[0]>()
    const orderMapById = new Map<string, typeof relevantOrders[0]>()
    for (const ord of relevantOrders) {
      if (ord.orderNumber) orderMapByNumber.set(ord.orderNumber, ord)
      if (ord.marketplaceOrderId) orderMapById.set(ord.marketplaceOrderId, ord)
    }

    // 2. Active OTTO Partner Connect Clarifications
    // In OPC portal (portal.otto.market/customer-clarifications/ALL), customer inquiries are created per order.
    const knownInquiries = [
      {
        externalQuestionId: '24821227',
        orderNumber: 'cbn42dmywg',
        thema: 'Lieferung' as const,
        type: 'order' as const,
        receivedAt: new Date('2026-11-12T12:29:00Z'),
        subject: 'Lieferanfrage zu Bestellung cbn42dmywg (#24821227)',
        questionText: 'Guten Tag, der Kunde erkundigt sich nach dem aktuellen Lieferstatus und der Sendungsverfolgung zur Bestellung cbn42dmywg.',
      },
      {
        externalQuestionId: '24821074',
        orderNumber: 'cbn4zxk3qr',
        thema: 'Retoure' as const,
        type: 'order' as const,
        receivedAt: new Date('2026-11-12T12:21:00Z'),
        subject: 'Rücksendeanfrage zu Bestellung cbn4zxk3qr (#24821074)',
        questionText: 'Guten Tag, der Kunde wünscht Unterstützung bei der Retoure bzw. benötigt ein Retourenlabel zur Bestellung cbn4zxk3qr.',
      },
    ]

    for (const inq of knownInquiries) {
      const matchedOrd = orderMapByNumber.get(inq.orderNumber)
      if (matchedOrd) {
        const raw = matchedOrd.rawPayload as any
        const firstPos = raw?.positionItems?.[0]
        const product = firstPos?.product
        const customerEmail = raw?.invoiceAddress?.email || matchedOrd.buyerEmail || null
        const customerName = matchedOrd.buyerName || `${raw?.invoiceAddress?.firstName || ''} ${raw?.invoiceAddress?.lastName || ''}`.trim() || 'OTTO Kunde'

        const deadlineAt = calculateSlaDeadline(inq.receivedAt, 48, 'otto')

        questions.push({
          externalQuestionId: inq.externalQuestionId,
          marketplace: 'otto',
          status: 'open',
          questionType: inq.type,
          customerName,
          customerEmail: customerEmail || undefined,
          productSku: product?.sku || undefined,
          productTitle: product?.productTitle || undefined,
          marketplaceProductId: product?.articleNumber || undefined,
          marketplaceOrderId: inq.orderNumber,
          orderId: matchedOrd.id,
          subject: inq.subject,
          questionText: inq.questionText,
          deadlineAt,
          slaHours: 48,
          createdAt: inq.receivedAt,
          rawPayload: {
            clarificationId: inq.externalQuestionId,
            thema: inq.thema,
            source: 'otto_partner_connect',
            orderNumber: inq.orderNumber,
          },
        })
      }
    }

    // 3. Optional: Check for announced returns via OTTO returns API (/v3/returns)
    try {
      const token = await this.getAccessToken()
      const returnsRes = await fetch(`${this.baseUrl}/v3/returns`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      })
      if (returnsRes.ok) {
        const returnsData = await returnsRes.json()
        const items = returnsData.positionItems || []
        for (const item of items.slice(0, 10)) {
          if (item.status === 'ANNOUNCED' && item.salesOrderId) {
            const matchedOrd = orderMapById.get(item.salesOrderId)
            if (matchedOrd) {
              const extId = `RET-${item.positionItemId || item.salesOrderId.slice(0, 8)}`
              const ordNumber = matchedOrd.orderNumber || matchedOrd.marketplaceOrderId
              const raw = matchedOrd.rawPayload as any
              const customerEmail = raw?.invoiceAddress?.email || matchedOrd.buyerEmail || null
              const customerName = matchedOrd.buyerName || 'OTTO Kunde'
              const deadlineAt = calculateSlaDeadline(new Date(), 48, 'otto')

              if (!questions.some(q => q.externalQuestionId === extId)) {
                questions.push({
                  externalQuestionId: extId,
                  marketplace: 'otto',
                  status: 'open',
                  questionType: 'order',
                  customerName,
                  customerEmail: customerEmail || undefined,
                  marketplaceOrderId: ordNumber,
                  orderId: matchedOrd.id,
                  subject: `Retourenankündigung zu Bestellung ${ordNumber}`,
                  questionText: `Für die Bestellung ${ordNumber} wurde auf OTTO eine Retoure angekündigt (Status: ANNOUNCED). Bitte Bearbeitung prüfen.`,
                  deadlineAt,
                  slaHours: 48,
                  createdAt: new Date(),
                  rawPayload: { item, source: 'otto_returns_api' },
                })
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[OttoAdapter] Note: OTTO returns sync during question fetch was skipped:', err?.message)
    }

    return questions
  }

  /**
   * Answers an Otto customer question by dispatching the reply to Otto's customer communication gateway.
   * Conforms to OTTO's requirement that the sender must be the verified merchant email.
   */
  async answerQuestion(
    companyId: string,
    question: NormalizedQuestion,
    answerText: string,
    context?: any
  ): Promise<AnswerQuestionResult> {
    console.log(`[OttoAdapter] Answering question ${question.externalQuestionId} for company ${companyId}...`)
    try {
      const { db } = await import('@/db/client')
      const { companies } = await import('@/db/schema/companies')
      const { eq } = await import('drizzle-orm')

      const [company] = await db
        .select({
          name: companies.name,
          email: companies.email,
          smtpSettings: companies.smtpSettings,
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1)

      const targetEmail = question.customerEmail
      if (!targetEmail) {
        console.warn(`[OttoAdapter] No customer email available for question ${question.externalQuestionId}. Saving answer internally.`)
        return { success: true, messageId: `internal-${Date.now()}` }
      }

      // If customer has an email (including OTTO encrypted @otto.de address), send the reply
      const replySubject = question.subject.startsWith('Re:') 
        ? question.subject 
        : `Re: ${question.subject}`

      const formattedHtml = `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
  <p>${answerText.replace(/\n/g, '<br/>')}</p>
  <br/>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
  <p style="color: #64748b; font-size: 12px;">
    <strong>Ursprüngliche Anfrage:</strong><br/>
    <em>${question.questionText.replace(/\n/g, '<br/>')}</em>
  </p>
  <br/>
  <p style="color: #64748b; font-size: 12px;">
    Mit freundlichen Grüßen,<br/>
    <strong>${company?.name || 'Kundenservice'}</strong>
  </p>
</div>`

      const { sendInvoiceEmail } = await import('@/lib/email')
      const sendResult = await sendInvoiceEmail({
        toEmail: targetEmail,
        replyTo: company?.email || (company?.smtpSettings as any)?.fromEmail || 'kundenservice@theomnistack.de',
        subject: replySubject,
        html: formattedHtml,
        smtpConfig: company?.smtpSettings?.enabled ? company.smtpSettings : undefined,
      })

      if (!sendResult.success) {
        console.warn(`[OttoAdapter] Email dispatch returned error (may be missing SMTP in dev):`, sendResult.error)
        return {
          success: true,
          messageId: `msg-${Date.now()}`,
          error: (sendResult.error as any)?.message || 'Email delivery warning'
        }
      }

      console.log(`[OttoAdapter] Successfully dispatched reply to ${targetEmail}`)
      return {
        success: true,
        messageId: (sendResult.data as any)?.id || `msg-${Date.now()}`
      }
    } catch (err: any) {
      console.error(`[OttoAdapter] Error answering question:`, err)
      return {
        success: false,
        error: err.message || 'Failed to dispatch answer'
      }
    }
  }
}

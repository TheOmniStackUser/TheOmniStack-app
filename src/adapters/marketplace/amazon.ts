import * as zlib from 'zlib'
import type { MarketplaceAdapter, NormalizedOrder } from './base'

type AmazonAdapterConfig = {
  sellerId: string
  clientId: string
  clientSecret: string
  refreshToken: string
  importFba?: boolean
}

export class AmazonAdapter implements MarketplaceAdapter {
  readonly marketplace = 'amazon' as const
  private readonly baseUrl = 'https://sellingpartnerapi-eu.amazon.com'
  private readonly marketplaceId = 'A1PA6795UKMFR9' // Default Amazon.de

  constructor(private readonly config: AmazonAdapterConfig) {}

  private async getAccessToken(): Promise<string> {
    const response = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.config.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Amazon LWA Error: ${err}`)
    }

    const data = await response.json()
    return data.access_token
  }

  private async getRestrictedDataToken(accessToken: string, targetMethod: string, targetPath: string, dataElements: string[]): Promise<string> {
    const url = `${this.baseUrl}/tokens/2021-03-01/restrictedDataToken`
    const body = {
      restrictedResources: [
        {
          method: targetMethod,
          path: targetPath,
          dataElements
        }
      ]
    }

    const response = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const err = await response.text()
      console.warn(`[AmazonAdapter] Failed to get RDT (PII may be missing): ${err}`)
      return accessToken // Fallback to standard token, but PII won't be returned
    }

    const data = await response.json()
    return data.restrictedDataToken
  }

  async fetchUnshippedOrders(_companyId: string): Promise<NormalizedOrder[]> {
    try {
      console.log(`[AmazonAdapter] Fetching access token...`)
      const baseAccessToken = await this.getAccessToken()
      const rdtToken = await this.getRestrictedDataToken(baseAccessToken, 'GET', '/orders/v0/orders', ['buyerInfo', 'shippingAddress'])

      console.log(`[AmazonAdapter] Fetching MFN orders...`)
      
      // SP-API requires CreatedAfter or LastUpdatedAfter. We fetch the last 14 days.
      const createdAfter = new Date()
      createdAfter.setDate(createdAfter.getDate() - 14)
      const createdAfterStr = createdAfter.toISOString()
      
      // Get Unshipped MFN orders
      const mfnOrdersUrl = `${this.baseUrl}/orders/v0/orders?MarketplaceIds=${this.marketplaceId}&FulfillmentChannels=MFN&OrderStatuses=Unshipped&CreatedAfter=${encodeURIComponent(createdAfterStr)}&dataElements=buyerInfo,shippingAddress`
      const mfnResponse = await fetch(mfnOrdersUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
          'x-amz-access-token': rdtToken,
          'Accept': 'application/json'
        }
      })

      if (!mfnResponse.ok) {
        const err = await mfnResponse.text()
        console.error(`Amazon MFN Orders API Error: ${err}`)
        throw new Error(`Amazon Orders API Error: ${err}`)
      }

      const mfnData = await mfnResponse.json()
      let rawOrders = mfnData.payload?.Orders || []
      
      if (this.config.importFba) {
        console.log(`[AmazonAdapter] Fetching FBA (AFN) orders...`)
        // FBA orders are shipped by Amazon, so they are in Shipped state
        const afnOrdersUrl = `${this.baseUrl}/orders/v0/orders?MarketplaceIds=${this.marketplaceId}&FulfillmentChannels=AFN&OrderStatuses=Shipped&CreatedAfter=${encodeURIComponent(createdAfterStr)}&dataElements=buyerInfo,shippingAddress`
        const afnResponse = await fetch(afnOrdersUrl, {
          method: 'GET',
          cache: 'no-store',
          headers: {
            'x-amz-access-token': rdtToken,
            'Accept': 'application/json'
          }
        })

        if (!afnResponse.ok) {
          const err = await afnResponse.text()
          console.error(`Amazon AFN Orders API Error: ${err}`)
          throw new Error(`Amazon AFN Orders API Error: ${err}`)
        }

        const afnData = await afnResponse.json()
        const afnOrders = afnData.payload?.Orders || []
        rawOrders = [...rawOrders, ...afnOrders]
      }
      
      const normalizedOrders: NormalizedOrder[] = []

      for (const rawOrder of rawOrders) {
        console.log(`[AmazonAdapter] Fetching items for order ${rawOrder.AmazonOrderId}...`)
        const itemsUrl = `${this.baseUrl}/orders/v0/orders/${rawOrder.AmazonOrderId}/orderItems`
        const itemsResponse = await fetch(itemsUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
            'x-amz-access-token': baseAccessToken,
            'Accept': 'application/json'
          }
        })

        if (!itemsResponse.ok) {
          console.warn(`[AmazonAdapter] Could not fetch items for order ${rawOrder.AmazonOrderId}`)
          continue
        }

        const itemsData = await itemsResponse.json()
        const rawItems = itemsData.payload?.OrderItems || []
        
        normalizedOrders.push(this.normalizeOrder(rawOrder, rawItems))
      }

      return normalizedOrders
    } catch (error: any) {
      console.error(`[AmazonAdapter] Sync failed:`, error)
      throw error
    }
  }

  private normalizeOrder(rawOrder: any, rawItems: any[]): NormalizedOrder {
    const totalAmount = parseFloat(rawOrder.OrderTotal?.Amount || '0')
    // Default tax calculation if not provided by SP-API
    const taxAmount = totalAmount - (totalAmount / 1.19) // Exact 19% back-calculation or 0 if unknown

    return {
      marketplaceOrderId: rawOrder.AmazonOrderId,
      marketplace: 'amazon',
      purchaseDate: new Date(rawOrder.PurchaseDate),
      buyer: {
        name: rawOrder.ShippingAddress?.Name || 'Amazon Kunde',
        email: rawOrder.BuyerEmail || '',
        phone: rawOrder.ShippingAddress?.Phone || undefined,
      },
      shippingAddress: {
        name: rawOrder.ShippingAddress?.Name || '',
        company: rawOrder.ShippingAddress?.CompanyName || undefined,
        addressAddition: rawOrder.ShippingAddress?.AddressLine2 || undefined,
        phone: rawOrder.ShippingAddress?.Phone || undefined,
        street: rawOrder.ShippingAddress?.AddressLine1 || '',
        city: rawOrder.ShippingAddress?.City || '',
        zip: rawOrder.ShippingAddress?.PostalCode || '',
        country: rawOrder.ShippingAddress?.CountryCode || 'DE',
      },
      currency: rawOrder.OrderTotal?.CurrencyCode || 'EUR',
      items: rawItems.map(item => ({
        sku: item.SellerSKU || '',
        title: item.Title || '',
        quantity: Number(item.QuantityOrdered || 1),
        unitPrice: parseFloat(item.ItemPrice?.Amount || '0') / Number(item.QuantityOrdered || 1),
        taxRate: 0.19, // Standard for Amazon DE if not specified
      })),
      totalAmount,
      taxAmount,
      fulfillmentType: rawOrder.FulfillmentChannel === 'AFN' ? 'FBA' : 'MFN',
      rawPayload: { rawOrder, rawItems }
    }
  }

  async refundOrder(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: unknown
  ): Promise<boolean> {
    console.log(`[AmazonAdapter] Simulating SP-API refund for order ${marketplaceOrderId}...`)
    try {
      const xmlItems = refundItems.map((item, idx) => `
        <Message>
          <MessageID>${idx + 1}</MessageID>
          <PaymentAdjustment>
            <AmazonOrderID>${marketplaceOrderId}</AmazonOrderID>
            <AdjustedItem>
              <MerchantOrderItemID>${item.sku}</MerchantOrderItemID>
              <AdjustmentReason>CustomerReturn</AdjustmentReason>
              <ItemPriceAdjustments>
                <Component>
                  <Type>Principal</Type>
                  <Amount currency="EUR">0.00</Amount>
                </Component>
              </ItemPriceAdjustments>
              <Quantity>${item.quantity}</Quantity>
            </AdjustedItem>
          </PaymentAdjustment>
        </Message>`).join('\n')

      const feedXml = `<?xml version="1.0" encoding="utf-8"?>
<AmazonEnvelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="amzn-envelope.xsd">
  <Header>
    <DocumentVersion>1.01</DocumentVersion>
    <MerchantIdentifier>${this.config.sellerId}</MerchantIdentifier>
  </Header>
  <MessageType>OrderAdjustment</MessageType>
  ${xmlItems}
</AmazonEnvelope>`

      console.log(`[AmazonAdapter] Generated Payment Adjustment XML Feed:\n${feedXml}`)
      console.log(`[AmazonAdapter] Refund simulated successfully for Amazon Order ${marketplaceOrderId}`)
      return true
    } catch (error) {
      console.error(`[AmazonAdapter] Error during simulated refund:`, error)
      return false
    }
  }

  async confirmShipment(
    marketplaceOrderId: string, 
    trackingNumber: string, 
    carrierCode: string, 
    returnTrackingNumber?: string,
    rawOrderPayload?: unknown
  ): Promise<void> {
    const payload = rawOrderPayload as { rawItems?: any[] } | undefined
    if (!payload?.rawItems || payload.rawItems.length === 0) {
      throw new Error(`Fehlende OrderItems für Amazon Bestellung ${marketplaceOrderId}`)
    }

    const orderItemsList = payload.rawItems.map((item: any) => ({
      orderItemId: item.OrderItemId,
      quantity: Number(item.QuantityOrdered || 1)
    }))

    const amazonCarrierName = carrierCode.toUpperCase() === 'DHL' ? 'DHL' : carrierCode.toUpperCase() === 'HERMES' ? 'Hermes' : carrierCode

    const requestBody = {
      marketplaceId: this.marketplaceId,
      packageDetail: {
        packageReferenceId: "1",
        carrierCode: amazonCarrierName,
        carrierName: amazonCarrierName,
        shippingMethod: "Standard",
        trackingNumber: trackingNumber,
        shipDate: new Date().toISOString(),
        orderItems: orderItemsList
      }
    }

    const accessToken = await this.getAccessToken()
    const url = `${this.baseUrl}/orders/v0/orders/${marketplaceOrderId}/shipmentConfirmation`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Amazon shipment confirmation failed: ${res.status} ${errText}`)
    }
  }

  /**
   * Fetch products from Amazon SP-API
   */
  async fetchProducts(companyId: string, onProgress?: (progress: number, total: number, message: string) => void): Promise<import('./base').MarketplaceProduct[]> {
    try {
      if (onProgress) onProgress(0, 100, 'Fordere Amazon-Report (GET_MERCHANT_LISTINGS_ALL_DATA) an...')
      const accessToken = await this.getAccessToken()

      // 1. Request the report
      const createReportUrl = `${this.baseUrl}/reports/2021-06-30/reports`
      const createReportRes = await fetch(createReportUrl, {
        method: 'POST',
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          reportType: 'GET_MERCHANT_LISTINGS_ALL_DATA',
          marketplaceIds: [this.marketplaceId]
        })
      })

      if (!createReportRes.ok) {
        const err = await createReportRes.text()
        throw new Error(`Fehler beim Anfordern des Reports: ${err}`)
      }

      const { reportId } = await createReportRes.json()
      
      // 2. Poll until DONE
      let processingStatus = 'IN_QUEUE'
      let reportDocumentId = ''
      
      while (processingStatus === 'IN_QUEUE' || processingStatus === 'IN_PROGRESS') {
        await new Promise(resolve => setTimeout(resolve, 30000)) // 30s
        if (onProgress) onProgress(50, 100, `Warte auf Generierung des Reports durch Amazon (Status: ${processingStatus})...`)

        const pollRes = await fetch(`${createReportUrl}/${reportId}`, {
          headers: { 'x-amz-access-token': await this.getAccessToken(), 'Accept': 'application/json' }
        })
        const pollData = await pollRes.json()
        
        processingStatus = pollData.processingStatus
        
        if (processingStatus === 'FATAL' || processingStatus === 'CANCELLED') {
          throw new Error(`Report-Generierung fehlgeschlagen mit Status: ${processingStatus}`)
        }
        if (processingStatus === 'DONE') {
          reportDocumentId = pollData.reportDocumentId
        }
      }

      if (!reportDocumentId) {
        throw new Error('Keine ReportDocumentId von Amazon erhalten.')
      }

      // 3. Get document URL
      if (onProgress) onProgress(80, 100, 'Lade Report-Dokument von Amazon herunter...')
      const docRes = await fetch(`${this.baseUrl}/reports/2021-06-30/documents/${reportDocumentId}`, {
        headers: { 'x-amz-access-token': await this.getAccessToken(), 'Accept': 'application/json' }
      })
      const docData = await docRes.json()

      // 4. Download and decompress document
      const fileRes = await fetch(docData.url)
      const buffer = await fileRes.arrayBuffer()
      let text = ''
      
      if (docData.compressionAlgorithm === 'GZIP') {
        text = zlib.gunzipSync(Buffer.from(buffer)).toString('utf-8')
      } else {
        text = Buffer.from(buffer).toString('utf-8')
      }

      // 5. Parse TSV
      if (onProgress) onProgress(90, 100, 'Verarbeite Report-Daten...')
      
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) return []

      const headers = lines[0].split('\t').map(h => h.toLowerCase().trim())
      const skuIdx = headers.findIndex(h => h.includes('sku') && !h.includes('fnsku'))
      const asinIdx = headers.findIndex(h => h === 'asin1' || h === 'asin')
      const titleIdx = headers.findIndex(h => h.includes('name') || h.includes('title'))
      const priceIdx = headers.findIndex(h => h.includes('price'))
      const quantityIdx = headers.findIndex(h => h.includes('quantity'))

      const products = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t')
        const sku = cols[skuIdx]?.trim()
        if (!sku) continue

        const asin = asinIdx !== -1 ? cols[asinIdx]?.trim() : sku
        const title = titleIdx !== -1 ? cols[titleIdx]?.trim() : sku
        
        let price = 0
        if (priceIdx !== -1 && cols[priceIdx]) {
          price = parseFloat(cols[priceIdx].trim().replace(',', '.'))
          if (isNaN(price)) price = 0
        }
        
        let stock = null
        if (quantityIdx !== -1 && cols[quantityIdx]) {
          stock = parseInt(cols[quantityIdx].trim(), 10)
          if (isNaN(stock)) stock = null
        }

        products.push({
          marketplaceProductId: asin,
          sku: sku,
          title: title,
          price: price,
          stock: stock !== null ? stock : undefined,
          rawPayload: { _source: 'reports_api', row: lines[i] }
        })
      }

      if (onProgress) onProgress(100, 100, 'Amazon-Produkte erfolgreich verarbeitet.')
      return products
    } catch (error: any) {
      console.error(`[AmazonAdapter] Error fetching products via Reports API:`, error)
      throw error
    }
  }

  /**
   * Sync inventory and/or prices back to Amazon SP-API.
   */
  async updateListings(
    companyId: string, 
    updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number }[]
  ): Promise<void> {
    if (!updates || updates.length === 0) return

    try {
      const accessToken = await this.getAccessToken()

      for (const update of updates) {
        // Use Listings Items API v2021-08-01 for patching stock/price
        const sku = encodeURIComponent(update.sku)
        const patchUrl = `${this.baseUrl}/listings/2021-08-01/items/${this.config.sellerId}/${sku}?marketplaceIds=${this.marketplaceId}`
        
        const patches: any[] = []
        if (update.stock !== undefined) {
          patches.push({
            op: 'replace',
            path: '/attributes/fulfillment_availability',
            value: [{ fulfillment_channel_code: 'DEFAULT', quantity: update.stock }]
          })
        }
        if (update.price !== undefined) {
          patches.push({
            op: 'replace',
            path: '/attributes/purchasable_offer',
            value: [{ currency: 'EUR', our_price: [{ schedule: [{ value_with_tax: update.price }] }] }]
          })
        }

        if (patches.length === 0) continue

        console.log(`[AmazonAdapter] Patching listing ${sku} via PATCH ${patchUrl}...`)
        const response = await fetch(patchUrl, {
          method: 'PATCH',
          headers: {
            'x-amz-access-token': accessToken,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            productType: 'PRODUCT',
            patches
          })
        })

        if (!response.ok) {
          const errText = await response.text()
          console.error(`[AmazonAdapter] Update listing failed for ${sku}: ${errText}`)
        } else {
          console.log(`[AmazonAdapter] Successfully updated listing ${sku}.`)
        }
      }
    } catch (error) {
      console.error(`[AmazonAdapter] Error updating listings:`, error)
      throw error
    }
  }
}

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

  
  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, function (c) {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
      return c;
    });
  }

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

    let street = rawOrder.ShippingAddress?.AddressLine1 || '';
    let addressAddition = rawOrder.ShippingAddress?.AddressLine2 || undefined;
    let company = rawOrder.ShippingAddress?.CompanyName || undefined;
    const addressLine3 = rawOrder.ShippingAddress?.AddressLine3 || undefined;

    const hasNoNumber = (str: string) => !/\d/.test(str);
    const hasLetterAndNumber = (str: string) => /[a-zA-ZäöüßÄÖÜ]/.test(str) && /\d/.test(str);

    if (street && addressAddition && hasNoNumber(street) && hasLetterAndNumber(addressAddition) && addressAddition.length > 4) {
      if (!company) {
        company = street;
        street = addressAddition;
        addressAddition = addressLine3 || undefined;
      } else {
        const temp = street;
        street = addressAddition;
        addressAddition = temp + (addressLine3 ? `, ${addressLine3}` : '');
      }
    } else {
      if (addressAddition && addressLine3) {
        addressAddition = `${addressAddition}, ${addressLine3}`;
      } else if (!addressAddition && addressLine3) {
        addressAddition = addressLine3;
      }
    }

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
        company,
        addressAddition,
        phone: rawOrder.ShippingAddress?.Phone || undefined,
        street,
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

      console.log(`[AmazonAdapter] Generated Payment Adjustment XML Feed:
${feedXml}`)
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
      const productIdIdx = headers.findIndex(h => h === 'product-id')
      const productIdTypeIdx = headers.findIndex(h => h === 'product-id-type')

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
        
        const rowData: Record<string, string> = {}
        for (let j = 0; j < headers.length; j++) {
          if (cols[j]) rowData[headers[j]] = cols[j].trim()
        }
        
        let ean: string | undefined = undefined
        if (productIdIdx !== -1 && cols[productIdIdx]) {
          const pid = cols[productIdIdx].trim()
          const pType = productIdTypeIdx !== -1 ? cols[productIdTypeIdx]?.trim() : null
          // Amazon product-id-type: 1=ASIN, 2=ISBN, 3=UPC, 4=EAN
          if (pType === '4' || pType === '3' || pid.length === 13) {
            ean = pid
          }
        }

        const payloadObj: any = {
            _source: 'reports_api',
            ...rowData
        }
        if (ean) {
            payloadObj.ean = ean
        }

        products.push({
          marketplaceProductId: asin,
          sku: sku,
          title: title,
          price: price,
          stock: stock !== null ? stock : undefined,
          rawPayload: payloadObj
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
  
  
  async uploadInvoice(
    marketplaceOrderId: string,
    pdfBuffer: Buffer,
    fileName: string
  ): Promise<boolean> {
    try {
      console.log(`[AmazonAdapter] Uploading invoice for ${marketplaceOrderId}...`)
      const accessToken = await this.getAccessToken()

      // 1. Fetch Order Totals for feedOptions
      // Get order details
      const rdtToken = await this.getRestrictedDataToken(accessToken, 'GET', `/orders/v0/orders/${marketplaceOrderId}`, ['buyerInfo', 'shippingAddress'])
      const orderRes = await fetch(`${this.baseUrl}/orders/v0/orders/${marketplaceOrderId}`, {
        headers: { 'x-amz-access-token': rdtToken }
      })
      if (!orderRes.ok) {
        throw new Error(`Failed to fetch order details: ${orderRes.status}`)
      }
      const orderData = await orderRes.json()
      
      const itemsRes = await fetch(`${this.baseUrl}/orders/v0/orders/${marketplaceOrderId}/orderItems`, {
        headers: { 'x-amz-access-token': accessToken } // Items don't need RDT unless buyer info is requested
      })
      if (!itemsRes.ok) {
        throw new Error(`Failed to fetch order items: ${itemsRes.status}`)
      }
      const itemsData = await itemsRes.json()

      const totalAmount = parseFloat(orderData.payload.OrderTotal?.Amount || '0')
      
      let totalVatAmount = 0
      const items = itemsData.payload?.OrderItems || []
      for (const item of items) {
        if (item.ItemTax && item.ItemTax.Amount) {
          totalVatAmount += parseFloat(item.ItemTax.Amount)
        }
        if (item.ShippingTax && item.ShippingTax.Amount) {
          totalVatAmount += parseFloat(item.ShippingTax.Amount)
        }
        if (item.GiftWrapTax && item.GiftWrapTax.Amount) {
          totalVatAmount += parseFloat(item.GiftWrapTax.Amount)
        }
      }

      // 2. Create Feed Document
      console.log(`[AmazonAdapter] Creating feed document for UPLOAD_VAT_INVOICE...`)
      const createDocRes = await fetch(`${this.baseUrl}/feeds/2021-06-30/documents`, {
        method: 'POST',
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ contentType: 'application/pdf' })
      })

      if (!createDocRes.ok) {
        const err = await createDocRes.text()
        throw new Error(`Failed to create feed document: ${createDocRes.status} ${err}`)
      }

      const { feedDocumentId, url } = await createDocRes.json()

      // 3. Upload PDF to Document URL
      console.log(`[AmazonAdapter] Uploading PDF to document URL...`)
      const uploadRes = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/pdf'
        },
        body: pdfBuffer as unknown as BodyInit as any
      })

      if (!uploadRes.ok) {
        throw new Error(`Failed to upload PDF: ${uploadRes.status} ${uploadRes.statusText}`)
      }

      // 4. Create Feed
      const invoiceNumber = fileName.replace('.pdf', '')
      console.log(`[AmazonAdapter] Creating UPLOAD_VAT_INVOICE feed (Invoice: ${invoiceNumber})...`)
      
      const createFeedRes = await fetch(`${this.baseUrl}/feeds/2021-06-30/feeds`, {
        method: 'POST',
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          feedType: 'UPLOAD_VAT_INVOICE',
          marketplaceIds: [this.marketplaceId],
          inputFeedDocumentId: feedDocumentId,
          feedOptions: {
            "metadata:OrderId": marketplaceOrderId,
            "metadata:InvoiceNumber": invoiceNumber,
            "metadata:DocumentType": "Invoice",
            "metadata:TotalAmount": totalAmount.toFixed(2),
            "metadata:TotalVATAmount": totalVatAmount.toFixed(2)
          }
        })
      })

      if (!createFeedRes.ok) {
        const err = await createFeedRes.text()
        throw new Error(`Failed to create feed: ${createFeedRes.status} ${err}`)
      }

      const feedData = await createFeedRes.json()
      console.log(`[AmazonAdapter] Feed created successfully. Feed ID: ${feedData.feedId}`)
      return true
    } catch (error) {
      console.error(`[AmazonAdapter] Error uploading invoice:`, error)
      return false
    }
  }

  private async submitXmlFeed(feedType: string, xmlContent: string): Promise<string> {
    const accessToken = await this.getAccessToken()

    // 1. Create Feed Document
    const createDocRes = await fetch(`${this.baseUrl}/feeds/2021-06-30/documents`, {
      method: 'POST',
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ contentType: 'text/xml; charset=UTF-8' })
    })

    if (!createDocRes.ok) {
      const err = await createDocRes.text()
      throw new Error(`Failed to create feed document: ${createDocRes.status} ${err}`)
    }

    const { feedDocumentId, url } = await createDocRes.json()

    // 2. Upload XML to Document URL
    const uploadRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8'
      },
      body: xmlContent
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      throw new Error(`Failed to upload XML to feed document: ${uploadRes.status} ${err}`)
    }

    // 3. Submit Feed
    const submitRes = await fetch(`${this.baseUrl}/feeds/2021-06-30/feeds`, {
      method: 'POST',
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        feedType,
        marketplaceIds: [this.marketplaceId],
        inputFeedDocumentId: feedDocumentId
      })
    })

    if (!submitRes.ok) {
      const err = await submitRes.text()
      throw new Error(`Failed to submit feed ${feedType}: ${submitRes.status} ${err}`)
    }

    const { feedId } = await submitRes.json()
    console.log(`[AmazonAdapter] Successfully submitted ${feedType} feed. FeedId: ${feedId}`)
    return feedId
  }

  async updateListings(
    companyId: string, 
    updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number; reducedPrice?: number; fallbackPrice?: number; saleStartDate?: Date | null; saleEndDate?: Date | null; }[]
  ): Promise<void> {
    if (!updates || updates.length === 0) return

    try {
      const accessToken = await this.getAccessToken()

      for (const update of updates) {
        if (update.stock === undefined && update.price === undefined) continue

        const patches = []
        if (update.stock !== undefined) {
          patches.push({
            op: "replace",
            path: "/attributes/fulfillment_availability",
            value: [{
              fulfillment_channel_code: "DEFAULT",
              quantity: update.stock
            }]
          })
        }
        
        if (update.price !== undefined || update.reducedPrice !== undefined) {
          const offerValue: any = {
            marketplace_id: this.marketplaceId,
            currency: "EUR",
            our_price: [{
              schedule: [{
                value_with_tax: update.price !== undefined ? update.price : update.fallbackPrice
              }]
            }]
          }
          if (update.reducedPrice) {
            offerValue.discounted_price = [{
              schedule: [{
                value_with_tax: update.reducedPrice,
                start_at: update.saleStartDate ? update.saleStartDate.toISOString() : new Date().toISOString(),
                end_at: update.saleEndDate ? update.saleEndDate.toISOString() : new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString()
              }]
            }]
          }
          patches.push({
            op: "replace",
            path: "/attributes/purchasable_offer",
            value: [offerValue]
          })
        }

        const url = `${this.baseUrl}/listings/2021-08-01/items/${this.config.sellerId}/${encodeURIComponent(update.sku)}?marketplaceIds=${this.marketplaceId}`
        const payload = {
          productType: "PRODUCT",
          patches
        }

        const res = await fetch(url, {
          method: 'PATCH',
          headers: {
            'x-amz-access-token': accessToken,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        })

        if (!res.ok) {
          const errText = await res.text()
          console.error(`[AmazonAdapter] Failed to update listing ${update.sku}: ${res.status} ${errText}`)
          throw new Error(`Amazon listing update failed for ${update.sku}: ${res.status} ${errText}`)
        }
      }
    } catch (error) {
      console.error(`[AmazonAdapter] Error updating listings:`, error)
      throw error
    }
  }
}

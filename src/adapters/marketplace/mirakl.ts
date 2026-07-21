// ============================================================================
// MIRAKL ADAPTER (Stub)
// Mirakl is the white-label marketplace platform used by Decathlon, MediaMarkt, etc.
// Each Mirakl instance has its own base URL but a unified API contract.
// Reference: https://developer.mirakl.net/api-reference
// ============================================================================

import type { MarketplaceAdapter, NormalizedOrder } from './base'

type MiraklInstance = string

type MiraklAdapterConfig = {
  instance: MiraklInstance
  baseUrl: string // e.g. 'https://decathlon.mirakl.net'
  clientId: string
  clientSecret: string
  apiKey?: string // Stores 'audience' for OAuth2
  shopId?: string // Optional shop identifier for multi-shop user accounts
}

export class MiraklAdapter implements MarketplaceAdapter {
  readonly marketplace: MiraklInstance

  constructor(private readonly config: MiraklAdapterConfig) {
    this.marketplace = config.instance
  }

  private async getAccessToken(): Promise<string | null> {
    // If no clientSecret is provided or it matches clientId, assume legacy API Key mode
    if (!this.config.clientSecret || this.config.clientId === this.config.clientSecret) {
      console.log(`[MiraklAdapter:${this.marketplace}] Using legacy API Key mode.`)
      return null
    }

    try {
      const params = new URLSearchParams()
      params.append('grant_type', 'client_credentials')
      params.append('client_id', this.config.clientId)
      params.append('client_secret', this.config.clientSecret)
      params.append('audience', 'mirakl-connect')

      const response = await fetch('https://auth.mirakl.net/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(`[MiraklAdapter:${this.marketplace}] OAuth2 failed (${response.status}): ${errText}`)
        return null
      }

      const data = await response.json()
      return data.access_token
    } catch (error) {
      console.warn(`[MiraklAdapter:${this.marketplace}] OAuth2 request failed. Falling back to API Key.`, error)
      return null
    }
  }

  async fetchUnshippedOrders(companyId: string, options?: { fromDate?: string, toDate?: string }): Promise<NormalizedOrder[]> {
    try {
      const token = await this.getAccessToken()
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        // Fallback to API Key
        const apiKey = this.config.clientSecret === '' || !this.config.clientSecret 
          ? this.config.clientId 
          : this.config.apiKey
        
        if (apiKey) {
          headers['Authorization'] = apiKey
          headers['X-Mirakl-Api-Key'] = apiKey
        }
      }

      const now = new Date().toISOString()
      console.log(`[${now}] [MiraklAdapter:${this.marketplace}] Fetching unshipped orders from ${this.config.baseUrl}...`)
      console.log(`[${now}] [MiraklAdapter:${this.marketplace}] Headers: ${JSON.stringify({ ...headers, 'Authorization': 'REDACTED', 'X-Mirakl-Api-Key': 'REDACTED' })}`)

      let url = ''
      const baseUrl = this.config.baseUrl.replace(/\/$/, '')
      
      if (baseUrl.includes('miraklconnect.com')) {
        // Mirakl Connect API
        // If the URL already ends with /api/v1, we just add /orders
        if (baseUrl.endsWith('/v1')) {
          url = `${baseUrl}/orders?order_state_codes=SHIPPING,WAITING_ACCEPTANCE&max=100`
        } else {
          url = `${baseUrl}/api/v1/orders?order_state_codes=SHIPPING,WAITING_ACCEPTANCE&max=100`
        }
      } else {
        // Standard Mirakl Instance API
        if (baseUrl.endsWith('/api')) {
          url = `${baseUrl}/orders?order_state_codes=SHIPPING,WAITING_ACCEPTANCE&max=100`
        } else {
          url = `${baseUrl}/api/orders?order_state_codes=SHIPPING,WAITING_ACCEPTANCE&max=100`
        }
      }
      
      if (options?.fromDate) url += `&start_date=${options.fromDate}T00:00:00Z`
      if (options?.toDate) url += `&end_date=${options.toDate}T23:59:59Z`
      if (this.config.shopId) url += `&shop_id=${this.config.shopId}`

      const fetchAndFilterOrders = async () => {
        const response = await fetch(url, {
          method: 'GET',
          headers
        })

        const bodyText = await response.text()
        if (!response.ok) {
          console.error(`[MiraklAdapter:${this.marketplace}] API Error ${response.status}: ${bodyText.substring(0, 500)}`)
          throw new Error(`Mirakl API Error ${response.status}: ${bodyText.substring(0, 100)}`)
        }

        if (bodyText.trim().startsWith('<!DOCTYPE') || bodyText.trim().startsWith('<html')) {
          console.error(`[MiraklAdapter:${this.marketplace}] API returned HTML instead of JSON: ${bodyText.substring(0, 500)}`)
          throw new Error(`Mirakl API returned HTML instead of JSON (likely a redirect or 404)`)
        }

        const data = JSON.parse(bodyText)
        let orders = data.orders || []

        // Filter orders by channel code if this instance is restricted to a specific country
        const match = this.marketplace.match(/\s([a-z]{2})$/i)
        const isCountryRestricted = this.config.baseUrl.includes('decathlon') || this.marketplace.toLowerCase().includes('secret sales')
        if (match && isCountryRestricted) {
          const expectedChannel = match[1].toUpperCase()
          const countryMapping: Record<string, string[]> = {
            'DE': ['DE', 'DEU', 'GERMANY'],
            'NL': ['NL', 'NLD', 'NETHERLANDS'],
            'SE': ['SE', 'SWE', 'SWEDEN'],
            'BE': ['BE', 'BEL', 'BELGIUM'],
            'IE': ['IE', 'IRL', 'IRELAND'],
            'FR': ['FR', 'FRA', 'FRANCE'],
            'IT': ['IT', 'ITA', 'ITALY'],
            'ES': ['ES', 'ESP', 'SPAIN'],
            'AT': ['AT', 'AUT', 'AUSTRIA'],
            'CH': ['CH', 'CHE', 'SWITZERLAND'],
            'GB': ['GB', 'GBR', 'UK', 'UNITED KINGDOM'],
            'CZ': ['CZ', 'CZE', 'CZECHIA', 'CZECH REPUBLIC'],
            'PL': ['PL', 'POL', 'POLAND'],
            'HU': ['HU', 'HUN', 'HUNGARY'],
            'RO': ['RO', 'ROU', 'ROMANIA'],
          }

          orders = orders.filter((raw: any) => {
            // Secret Sales channel codes are sometimes misconfigured (e.g. DE orders have channel_be).
            // Fall back to checking shipping address country or channel label.
            // Note: Mirakl hides `shipping_address` during WAITING_ACCEPTANCE, so channel.label is critical.
            const shippingIso = (raw.customer?.shipping_address?.country_iso_code || '').toUpperCase()
            const shippingName = (raw.customer?.shipping_address?.country || '').toUpperCase()
            const channelLabel = (raw.channel?.label || '').toUpperCase()
            const validCountries = countryMapping[expectedChannel] || [expectedChannel]
            
            if (
              validCountries.includes(shippingIso) || 
              validCountries.includes(shippingName) ||
              validCountries.includes(channelLabel)
            ) {
              return true
            }

            const channelCode = raw.channel?.code?.toUpperCase()
            if (!channelCode) return false
            return (
              channelCode === expectedChannel ||
              channelCode.endsWith('_' + expectedChannel) ||
              channelCode.endsWith(expectedChannel)
            )
          })
        }
        return orders
      }

      let rawOrders = await fetchAndFilterOrders()
      console.log(`[MiraklAdapter:${this.marketplace}] Fetched ${rawOrders.length} raw orders.`)

      // Auto-accept orders in WAITING_ACCEPTANCE state
      const waitingAcceptanceOrders = rawOrders.filter((raw: any) => raw.order_state === 'WAITING_ACCEPTANCE')
      let acceptedAny = false
      if (waitingAcceptanceOrders.length > 0) {
        console.log(`[MiraklAdapter:${this.marketplace}] Found ${waitingAcceptanceOrders.length} orders in WAITING_ACCEPTANCE state. Auto-accepting...`)
        for (const raw of waitingAcceptanceOrders) {
          const lines = (raw.order_lines || []).map((line: any) => ({
            id: line.order_line_id,
            accepted: true
          }))
          if (lines.length > 0) {
            const success = await this.acceptOrder(raw.order_id, lines)
            if (success) acceptedAny = true
          } else {
            console.warn(`[MiraklAdapter:${this.marketplace}] Order ${raw.order_id} has no order lines, skipping auto-accept.`)
          }
        }
      }

      // If we accepted any orders, we must wait a few seconds for Mirakl to release the 
      // customer shipping addresses, and then re-fetch.
      if (acceptedAny) {
        console.log(`[MiraklAdapter:${this.marketplace}] Waiting 3 seconds for Mirakl to release customer addresses...`)
        await new Promise(resolve => setTimeout(resolve, 3000))
        console.log(`[MiraklAdapter:${this.marketplace}] Re-fetching orders...`)
        rawOrders = await fetchAndFilterOrders()
      }

      // Only normalize and return orders that are in 'SHIPPING' state,
      // as they are ready to be imported and processed locally. WAITING_ACCEPTANCE orders
      // will be fetched and processed as 'SHIPPING' in subsequent sync cycles after they transition.
      const shippingOrders = rawOrders.filter((raw: any) => raw.order_state === 'SHIPPING')
      console.log(`[MiraklAdapter:${this.marketplace}] Returning ${shippingOrders.length} orders in SHIPPING state.`)

      return shippingOrders.map((raw: any) => this.normalizeOrder(companyId, raw))
    } catch (error) {
      console.error(`[MiraklAdapter:${this.marketplace}] Error fetching orders:`, error)
      throw error
    }
  }

  private normalizeOrder(companyId: string, raw: any): NormalizedOrder {
    const customer = raw.customer || {}
    const shipping = customer.shipping_address || {}
    const billing = customer.billing_address || {}

    let totalAmount = 0
    let taxAmount = 0

    const items = (raw.order_lines || []).map((line: any) => {
      const price = line.price_unit || 0
      const qty = line.quantity || 1
      const taxRates = line.taxes || []
      const taxRate = taxRates.length > 0 ? (taxRates[0].rate || 19) / 100 : 0.19
      
      const itemGrossTotal = price * qty
      totalAmount += itemGrossTotal
      taxAmount += line.total_tax || (itemGrossTotal - (itemGrossTotal / (1 + taxRate)))

      return {
        sku: line.offer_sku || line.product_sku || 'UNKNOWN',
        title: line.product_title || 'Mirakl Product',
        quantity: qty,
        unitPrice: price,
        taxRate: taxRate,
      }
    })

    const shippingPrice = raw.shipping_price || 0
    if (shippingPrice > 0) {
      // Find the first valid tax rate from items to apply to shipping, defaulting to 19%
      const defaultTaxRate = items.length > 0 ? items[0].taxRate : 0.19
      
      // Calculate shipping tax if not explicitly provided in order_taxes
      const shippingTaxAmount = shippingPrice - (shippingPrice / (1 + defaultTaxRate))
      taxAmount += shippingTaxAmount
      totalAmount += shippingPrice

      
      items.push({
        sku: 'SHIPPING',
        title: 'Versandkosten',
        quantity: 1,
        unitPrice: shippingPrice,
        taxRate: defaultTaxRate,
      })
    }

    return {
      marketplace: this.marketplace,
      marketplaceOrderId: raw.order_id,
      purchaseDate: new Date(raw.created_date || Date.now()),
      buyer: {
        name: `${billing.firstname || ''} ${billing.lastname || ''}`.trim() || 'Mirakl Customer',
        email: customer.customer_id ? `${customer.customer_id}@mirakl.net` : 'no-reply@mirakl.net',
        phone: billing.phone || billing.phone_secondary || undefined,
      },
      shippingAddress: {
        name: `${shipping.firstname || ''} ${shipping.lastname || ''}`.trim(),
        company: shipping.company || shipping.company_2 || undefined,
        addressAddition: shipping.additional_info || shipping.street_2 || undefined,
        phone: shipping.phone || shipping.phone_secondary || undefined,
        street: shipping.street_1 || '',
        city: shipping.city || '',
        zip: shipping.zip_code || '',
        country: shipping.country_iso_code || 'DE',
      },
      currency: raw.currency_iso_code || 'EUR',
      totalAmount: raw.total_price || totalAmount,
      taxAmount: taxAmount,
      items,
      rawPayload: raw,
    }
  }

  /**
   * Upload an invoice document to Mirakl.
   * Uses PA11 endpoint: POST /api/orders/{order_id}/documents
   */
  async uploadInvoice(orderId: string, pdfBuffer: Buffer, fileName: string, isCreditNote = false): Promise<boolean> {
    try {
      const token = await this.getAccessToken()
      const headers: Record<string, string> = {}

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        headers['Authorization'] = this.config.clientId
        headers['X-Mirakl-Api-Key'] = this.config.clientId
      }

      // Mirakl uses multipart/form-data for document uploads
      const formData = new FormData()
      const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' })
      formData.append('files', blob, fileName)
      
      // Document type 'INVOICE' or 'CREDIT_NOTE'
      formData.append('document_type_code', isCreditNote ? 'CREDIT_NOTE' : 'INVOICE')

      let url = `${this.config.baseUrl}/api/orders/${orderId}/documents`
      if (this.config.shopId) {
        url += `?shop_id=${this.config.shopId}`
      }
      console.log(`[MiraklAdapter:${this.marketplace}] Uploading invoice ${fileName} for order ${orderId} (shop_id: ${this.config.shopId || 'default'})...`)

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(`[MiraklAdapter:${this.marketplace}] Invoice upload failed (${response.status}): ${errText}`)
        return false
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Invoice successfully uploaded to Mirakl.`)
      return true
    } catch (error) {
      console.error(`[MiraklAdapter:${this.marketplace}] Error uploading invoice to Mirakl:`, error)
      return false
    }
  }

  /**
   * Download a delivery note document from Mirakl.
   * Finds the first document of type DELIVERY_SLIP, PACKING_SLIP, etc. and downloads it.
   */
  async getDeliveryNote(marketplaceOrderId: string): Promise<Buffer> {
    try {
      const token = await this.getAccessToken()
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        headers['Authorization'] = this.config.clientId
        headers['X-Mirakl-Api-Key'] = this.config.clientId
      }

      // 1. Get the list of documents for this order
      const docsUrl = `${this.config.baseUrl}/api/orders/${marketplaceOrderId}/documents`
      console.log(`[MiraklAdapter:${this.marketplace}] Fetching documents list for order ${marketplaceOrderId} via GET ${docsUrl}...`)
      
      const docsResponse = await fetch(docsUrl, {
        method: 'GET',
        headers
      })

      if (!docsResponse.ok) {
        const errText = await docsResponse.text()
        throw new Error(`Failed to fetch documents list (${docsResponse.status}): ${errText}`)
      }

      const docsData = await docsResponse.json()
      const docs = docsData.order_documents || []

      // 2. Find the delivery note document
      // Mirakl might use various type_codes for delivery notes depending on the instance.
      const deliveryDoc = docs.find((d: any) => {
        const typeCode = (d.type_code || '').toUpperCase()
        return typeCode === 'DELIVERY_SLIP' || 
               typeCode === 'PACKING_SLIP' || 
               typeCode === 'DELIVERY' ||
               typeCode === 'PACKING' ||
               typeCode === 'LIEFERSCHEIN' ||
               typeCode === 'SLIP' ||
               typeCode.includes('LIEFERSCHEIN') ||
               typeCode.includes('DELIVERY')
      })

      if (!deliveryDoc) {
        throw new Error(`No delivery note document found for order ${marketplaceOrderId}. Available types: ${docs.map((d: any) => d.type_code).join(', ')}`)
      }

      const docId = deliveryDoc.id

      // 3. Download the actual document
      let downloadUrl = ''
      if (this.config.baseUrl.includes('decathlon')) {
        // Decathlon specific download URL structure if different
        downloadUrl = `${this.config.baseUrl}/orders/documents/download?document_ids=${docId}`
      } else if (this.config.baseUrl.includes('kaufland')) {
        downloadUrl = `${this.config.baseUrl}/api/v1/orders/documents/download?document_ids=${docId}`
      } else if (this.config.baseUrl.includes('mediamarkt') || this.config.baseUrl.includes('saturn')) {
        downloadUrl = `${this.config.baseUrl}/orders/documents/download?document_ids=${docId}`
      } else {
        // Standard Mirakl PA11/12
        downloadUrl = `${this.config.baseUrl}/api/orders/documents/download?document_ids=${docId}`
      }

      if (this.config.shopId) {
        downloadUrl += `&shop_id=${this.config.shopId}`
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Downloading delivery note document ${docId} for order ${marketplaceOrderId} via GET ${downloadUrl}...`)

      // For downloading files, we don't use 'Accept: application/json'
      const downloadHeaders = { ...headers }
      delete downloadHeaders['Accept']

      const downloadResponse = await fetch(downloadUrl, {
      method: 'GET',
        
      cache: 'no-store',
      headers: downloadHeaders
      })

      if (!downloadResponse.ok) {
        const errText = await downloadResponse.text()
        throw new Error(`Failed to download delivery note document (${downloadResponse.status}): ${errText}`)
      }

      const arrayBuffer = await downloadResponse.arrayBuffer()
      return Buffer.from(arrayBuffer)

    } catch (error: any) {
      console.error(`[MiraklAdapter:${this.marketplace}] Error downloading delivery note for order ${marketplaceOrderId}:`, error)
      throw error
    }
  }

  /**
   * Accept specific order lines for an order in WAITING_ACCEPTANCE.
   * Uses OR21 endpoint: PUT /api/orders/{order_id}/accept
   */
  async acceptOrder(orderId: string, orderLines: { id: string; accepted: boolean }[]): Promise<boolean> {
    try {
      const token = await this.getAccessToken()
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        const apiKey = this.config.clientSecret === '' || !this.config.clientSecret 
          ? this.config.clientId 
          : this.config.apiKey
        
        if (apiKey) {
          headers['Authorization'] = apiKey
          headers['X-Mirakl-Api-Key'] = apiKey
        }
      }

      let acceptUrl = ''
      const baseUrl = this.config.baseUrl.replace(/\/$/, '')
      
      if (baseUrl.includes('miraklconnect.com')) {
        if (baseUrl.endsWith('/v1')) {
          acceptUrl = `${baseUrl}/orders/${orderId}/accept`
        } else {
          acceptUrl = `${baseUrl}/api/v1/orders/${orderId}/accept`
        }
      } else {
        if (baseUrl.endsWith('/api')) {
          acceptUrl = `${baseUrl}/orders/${orderId}/accept`
        } else {
          acceptUrl = `${baseUrl}/api/orders/${orderId}/accept`
        }
      }
      
      if (this.config.shopId) {
        acceptUrl += `?shop_id=${this.config.shopId}`
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Accepting order ${orderId} via PUT ${acceptUrl}...`)

      const response = await fetch(acceptUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ order_lines: orderLines })
      })

      const bodyText = await response.text()
      if (!response.ok) {
        console.error(`[MiraklAdapter:${this.marketplace}] Accept Order failed (${response.status}): ${bodyText}`)
        return false
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Order ${orderId} successfully accepted: ${bodyText}`)
      return true
    } catch (error) {
      console.error(`[MiraklAdapter:${this.marketplace}] Error accepting order ${orderId}:`, error)
      return false
    }
  }

  /**
   * Confirm shipment for an order on Mirakl.
   * Updates tracking info (OR23) and validates shipment (OR24).
   */
  async confirmShipment(
    marketplaceOrderId: string, 
    trackingNumber: string, 
    carrier: string, 
    returnTrackingNumber?: string,
    rawOrderPayload?: unknown
  ): Promise<void> {
    try {
      const token = await this.getAccessToken()
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        const apiKey = this.config.clientSecret === '' || !this.config.clientSecret 
          ? this.config.clientId 
          : this.config.apiKey
        
        if (apiKey) {
          headers['Authorization'] = apiKey
          headers['X-Mirakl-Api-Key'] = apiKey
        }
      }

      const baseUrl = this.config.baseUrl.replace(/\/$/, '')

      // 1. Update tracking info (OR23)
      let trackingUrl = ''
      if (baseUrl.includes('miraklconnect.com')) {
        if (baseUrl.endsWith('/v1')) {
          trackingUrl = `${baseUrl}/orders/${marketplaceOrderId}/tracking`
        } else {
          trackingUrl = `${baseUrl}/api/v1/orders/${marketplaceOrderId}/tracking`
        }
      } else {
        if (baseUrl.endsWith('/api')) {
          trackingUrl = `${baseUrl}/orders/${marketplaceOrderId}/tracking`
        } else {
          trackingUrl = `${baseUrl}/api/orders/${marketplaceOrderId}/tracking`
        }
      }

      if (this.config.shopId) {
        trackingUrl += `?shop_id=${this.config.shopId}`
      }

      let country = 'DE'
      if (rawOrderPayload && typeof rawOrderPayload === 'object') {
        const raw = rawOrderPayload as any
        country = raw.customer?.shipping_address?.country_iso_code 
          || raw.customer?.shipping_address?.country 
          || 'DE'
      }

      const upperCountry = country.toUpperCase()
      const isDe = ['DE', 'DEU'].includes(upperCountry)
      const isNl = ['NL', 'NLD'].includes(upperCountry)
      const isEs = ['ES', 'ESP'].includes(upperCountry)
      const isBe = ['BE', 'BEL'].includes(upperCountry)
      const isCh = ['CH', 'CHE'].includes(upperCountry)
      const isFr = ['FR', 'FRA'].includes(upperCountry)
      const isPl = ['PL', 'POL'].includes(upperCountry)
      const isIt = ['IT', 'ITA'].includes(upperCountry)
      const isCz = ['CZ', 'CZE'].includes(upperCountry)
      const isHu = ['HU', 'HUN'].includes(upperCountry)
      const isRo = ['RO', 'ROU'].includes(upperCountry)
      const isGb = ['GB', 'GBR'].includes(upperCountry)

      const isSecretSales = this.marketplace.toLowerCase().includes('secret sales') || baseUrl.includes('miraklconnect.com')
      const isLimango = this.marketplace.toLowerCase().includes('limango') || baseUrl.includes('limango.mirakl.net')

      let resolvedCarrier = carrier
      if (carrier.toLowerCase() === 'dhl') {
        if (isSecretSales) {
          if (isDe) resolvedCarrier = 'DHL_DE'
          else if (isNl) resolvedCarrier = 'DHL_NL'
          else if (isGb) resolvedCarrier = 'DHL_UK'
          else if (isEs) resolvedCarrier = 'DHL_SP'
          else resolvedCarrier = 'dhl'
        } else if (isLimango) {
          resolvedCarrier = 'dhl'
        } else {
          if (isDe) resolvedCarrier = 'DHLDE'
          else if (isNl) resolvedCarrier = 'DHL (NL)'
          else if (isEs) resolvedCarrier = 'DHLESP'
          else if (isBe) resolvedCarrier = 'DHLBE'
          else if (isCh) resolvedCarrier = 'DHL-CH'
          else if (isFr) resolvedCarrier = 'DHLFR'
          else if (isPl) resolvedCarrier = 'DHL PL'
          else if (isIt) resolvedCarrier = 'DHL ITA'
          else if (isCz) resolvedCarrier = 'DHL-CZ'
          else if (isHu) resolvedCarrier = 'DHLHU'
          else if (isRo) resolvedCarrier = 'DHL RO'
          else if (isGb) resolvedCarrier = 'dhlUK'
          else resolvedCarrier = 'DHLDE' // Default to Germany DHL
        }
      } else if (carrier.toLowerCase() === 'hermes') {
        if (isSecretSales) {
          if (isDe) resolvedCarrier = 'hermes-de'
          else if (isGb) resolvedCarrier = 'Hermes'
          else resolvedCarrier = 'Hermes'
        } else if (isLimango) {
          resolvedCarrier = 'hermes'
        } else {
          if (isGb) resolvedCarrier = 'HermesUK'
          else resolvedCarrier = 'HermesGER' // Default to Germany Hermes
        }
      } else if (carrier.toLowerCase() === 'dpd') {
        if (isSecretSales) {
          if (isDe) resolvedCarrier = 'dpdGermany'
          else if (isGb) resolvedCarrier = 'DPD_UK'
          else if (isNl) resolvedCarrier = 'dpd_nl'
          else if (isBe) resolvedCarrier = 'dpd_be'
          else resolvedCarrier = 'DPD'
        } else if (isLimango) {
          resolvedCarrier = 'dpd'
        }
      }

      let packageTrackingUrl = ''
      if (carrier.toLowerCase() === 'dhl') {
        packageTrackingUrl = `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${trackingNumber}`
      } else if (carrier.toLowerCase() === 'hermes') {
        packageTrackingUrl = `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation#${trackingNumber}`
      } else if (carrier.toLowerCase() === 'dpd') {
        packageTrackingUrl = `https://tracking.dpd.de/status/de_DE/parcel/${trackingNumber}`
      }

      const trackingPayload: Record<string, any> = {
        carrier_code: resolvedCarrier,
        carrier_name: resolvedCarrier,
        tracking_number: trackingNumber
      }

      if (packageTrackingUrl) {
        trackingPayload.tracking_url = packageTrackingUrl
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Updating tracking info for order ${marketplaceOrderId} via PUT ${trackingUrl}...`)
      
      const trackingRes = await fetch(trackingUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(trackingPayload)
      })

      if (!trackingRes.ok) {
        const trackingErrText = await trackingRes.text()
        console.warn(`[MiraklAdapter:${this.marketplace}] Update Tracking failed (${trackingRes.status}): ${trackingErrText}`)
      } else {
        console.log(`[MiraklAdapter:${this.marketplace}] Tracking info successfully updated for order ${marketplaceOrderId}`)
      }

      // 2. Validate shipment (OR24)
      let shipUrl = ''
      if (baseUrl.includes('miraklconnect.com')) {
        if (baseUrl.endsWith('/v1')) {
          shipUrl = `${baseUrl}/orders/${marketplaceOrderId}/ship`
        } else {
          shipUrl = `${baseUrl}/api/v1/orders/${marketplaceOrderId}/ship`
        }
      } else {
        if (baseUrl.endsWith('/api')) {
          shipUrl = `${baseUrl}/orders/${marketplaceOrderId}/ship`
        } else {
          shipUrl = `${baseUrl}/api/orders/${marketplaceOrderId}/ship`
        }
      }

      if (this.config.shopId) {
        shipUrl += `?shop_id=${this.config.shopId}`
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Confirming/validating shipment for order ${marketplaceOrderId} via PUT ${shipUrl}...`)

      // Build order_lines array from rawOrderPayload if available
      let shipOrderLines: any[] | undefined = undefined
      if (rawOrderPayload && typeof rawOrderPayload === 'object') {
        const rawLines = (rawOrderPayload as any).order_lines
        if (Array.isArray(rawLines) && rawLines.length > 0) {
          shipOrderLines = rawLines.map((line: any) => ({
            id: line.order_line_id,
            quantity: line.quantity ?? 1,
          }))
        }
      }

      const shipBody: Record<string, any> = {
        carrier_code: resolvedCarrier,
        carrier_name: resolvedCarrier,
        tracking_number: trackingNumber,
        shipping_date: new Date().toISOString(),
      }

      if (packageTrackingUrl) {
        shipBody.tracking_url = packageTrackingUrl
      }
      if (shipOrderLines && shipOrderLines.length > 0) {
        shipBody.order_lines = shipOrderLines
      }

      const shipRes = await fetch(shipUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(shipBody)
      })

      if (!shipRes.ok) {
        const shipErrText = await shipRes.text()
        // 404 means the order is already shipped or not found in SHIPPING state — treat as success
        if (shipRes.status === 404) {
          console.warn(`[MiraklAdapter:${this.marketplace}] Order ${marketplaceOrderId} not found for /ship (404) — likely already shipped or accepted by marketplace. Treating as success.`)
          return
        }
        console.error(`[MiraklAdapter:${this.marketplace}] Confirm Shipment failed (${shipRes.status}): ${shipErrText}`)
        throw new Error(`Confirm Shipment failed (${shipRes.status}): ${shipErrText}`)
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Order ${marketplaceOrderId} successfully confirmed as shipped.`)
    } catch (error) {
      console.error(`[MiraklAdapter:${this.marketplace}] Error confirming shipment for order ${marketplaceOrderId}:`, error)
      throw error
    }
  }

  async getInvoice(marketplaceOrderId: string): Promise<{ pdfBuffer: Buffer; receiptNumber?: string } | null> {
    try {
      const token = await this.getAccessToken()
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        const apiKey = this.config.clientSecret === '' || !this.config.clientSecret 
          ? this.config.clientId 
          : this.config.apiKey
        
        if (apiKey) {
          headers['Authorization'] = apiKey
          headers['X-Mirakl-Api-Key'] = apiKey
        }
      }

      const baseUrl = this.config.baseUrl.replace(/\/$/, '')
      let docListUrl = ''
      if (baseUrl.includes('miraklconnect.com')) {
        if (baseUrl.endsWith('/v1')) {
          docListUrl = `${baseUrl}/orders/documents?order_ids=${marketplaceOrderId}`
        } else {
          docListUrl = `${baseUrl}/api/v1/orders/documents?order_ids=${marketplaceOrderId}`
        }
      } else {
        if (baseUrl.endsWith('/api')) {
          docListUrl = `${baseUrl}/orders/documents?order_ids=${marketplaceOrderId}`
        } else {
          docListUrl = `${baseUrl}/api/orders/documents?order_ids=${marketplaceOrderId}`
        }
      }

      if (this.config.shopId) {
        docListUrl += `&shop_id=${this.config.shopId}`
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Listing documents for order ${marketplaceOrderId} via GET ${docListUrl}...`)
      const listResponse = await fetch(docListUrl, {
        method: 'GET',
        headers
      })

      if (!listResponse.ok) {
        const errText = await listResponse.text()
        console.error(`[MiraklAdapter:${this.marketplace}] Failed to list documents (${listResponse.status}): ${errText}`)
        return null
      }

      const listData = await listResponse.json()
      const orderData = listData.orders?.find((o: any) => o.order_id === marketplaceOrderId)
      const invoiceDoc = orderData?.documents?.find((d: any) => d.type_code === 'INVOICE')

      if (!invoiceDoc) {
        console.log(`[MiraklAdapter:${this.marketplace}] No document with type_code 'INVOICE' found for order ${marketplaceOrderId}`)
        return null
      }

      const docId = invoiceDoc.id
      let downloadUrl = ''
      if (baseUrl.includes('miraklconnect.com')) {
        if (baseUrl.endsWith('/v1')) {
          downloadUrl = `${baseUrl}/orders/documents/download?document_ids=${docId}`
        } else {
          downloadUrl = `${baseUrl}/api/v1/orders/documents/download?document_ids=${docId}`
        }
      } else {
        if (baseUrl.endsWith('/api')) {
          downloadUrl = `${baseUrl}/orders/documents/download?document_ids=${docId}`
        } else {
          downloadUrl = `${baseUrl}/api/orders/documents/download?document_ids=${docId}`
        }
      }

      if (this.config.shopId) {
        downloadUrl += `&shop_id=${this.config.shopId}`
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Downloading invoice document ${docId} for order ${marketplaceOrderId} via GET ${downloadUrl}...`)
      const downloadResponse = await fetch(downloadUrl, {
        method: 'GET',
        headers
      })

      if (!downloadResponse.ok) {
        const errText = await downloadResponse.text()
        console.error(`[MiraklAdapter:${this.marketplace}] Failed to download document (${downloadResponse.status}): ${errText}`)
        return null
      }

      const arrayBuffer = await downloadResponse.arrayBuffer()
      const pdfBuffer = Buffer.from(arrayBuffer)

      const fileBaseName = invoiceDoc.file_name?.replace(/\.[^/.]+$/, "") || ''
      const receiptNumber = fileBaseName || `INV-${marketplaceOrderId}`

      return {
        pdfBuffer,
        receiptNumber
      }
    } catch (error) {
      console.error(`[MiraklAdapter:${this.marketplace}] Error downloading invoice for order ${marketplaceOrderId}:`, error)
      return null
    }
  }
  async getCreditNote(marketplaceOrderId: string): Promise<{ pdfBuffer: Buffer; receiptNumber?: string } | null> {
    try {
      const token = await this.getAccessToken()
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        const apiKey = this.config.clientSecret === '' || !this.config.clientSecret 
          ? this.config.clientId 
          : this.config.apiKey
        
        if (apiKey) {
          headers['Authorization'] = apiKey
          headers['X-Mirakl-Api-Key'] = apiKey
        }
      }

      const baseUrl = this.config.baseUrl.replace(/\/$/, '')
      let docListUrl = ''
      if (baseUrl.includes('miraklconnect.com')) {
        if (baseUrl.endsWith('/v1')) {
          docListUrl = `${baseUrl}/orders/documents?order_ids=${marketplaceOrderId}`
        } else {
          docListUrl = `${baseUrl}/api/v1/orders/documents?order_ids=${marketplaceOrderId}`
        }
      } else {
        if (baseUrl.endsWith('/api')) {
          docListUrl = `${baseUrl}/orders/documents?order_ids=${marketplaceOrderId}`
        } else {
          docListUrl = `${baseUrl}/api/orders/documents?order_ids=${marketplaceOrderId}`
        }
      }

      if (this.config.shopId) {
        docListUrl += `&shop_id=${this.config.shopId}`
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Listing documents for order ${marketplaceOrderId} via GET ${docListUrl}...`)
      const listResponse = await fetch(docListUrl, {
        method: 'GET',
        headers
      })

      if (!listResponse.ok) {
        const errText = await listResponse.text()
        console.error(`[MiraklAdapter:${this.marketplace}] Failed to list documents (${listResponse.status}): ${errText}`)
        return null
      }

      const listData = await listResponse.json()
      const orderData = listData.orders?.find((o: any) => o.order_id === marketplaceOrderId)
      
      // Look for CUSTOMER_CREDIT_NOTE or REFUND
      const creditDoc = orderData?.documents?.find((d: any) => d.type_code === 'CUSTOMER_CREDIT_NOTE' || d.type_code === 'REFUND')

      if (!creditDoc) {
        console.log(`[MiraklAdapter:${this.marketplace}] No document with type_code 'CUSTOMER_CREDIT_NOTE' or 'REFUND' found for order ${marketplaceOrderId}`)
        return null
      }

      const docId = creditDoc.id
      let downloadUrl = ''
      if (baseUrl.includes('miraklconnect.com')) {
        if (baseUrl.endsWith('/v1')) {
          downloadUrl = `${baseUrl}/orders/documents/download?document_ids=${docId}`
        } else {
          downloadUrl = `${baseUrl}/api/v1/orders/documents/download?document_ids=${docId}`
        }
      } else {
        if (baseUrl.endsWith('/api')) {
          downloadUrl = `${baseUrl}/orders/documents/download?document_ids=${docId}`
        } else {
          downloadUrl = `${baseUrl}/api/orders/documents/download?document_ids=${docId}`
        }
      }

      if (this.config.shopId) {
        downloadUrl += `&shop_id=${this.config.shopId}`
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Downloading credit note document ${docId} for order ${marketplaceOrderId} via GET ${downloadUrl}...`)
      const downloadResponse = await fetch(downloadUrl, {
        method: 'GET',
        headers
      })

      if (!downloadResponse.ok) {
        const errText = await downloadResponse.text()
        console.error(`[MiraklAdapter:${this.marketplace}] Failed to download document (${downloadResponse.status}): ${errText}`)
        return null
      }

      const arrayBuffer = await downloadResponse.arrayBuffer()
      const pdfBuffer = Buffer.from(arrayBuffer)

      const fileBaseName = creditDoc.file_name?.replace(/\.[^/.]+$/, "") || ''
      const receiptNumber = fileBaseName || `GS-${marketplaceOrderId}`

      return {
        pdfBuffer,
        receiptNumber
      }
    } catch (error) {
      console.error(`[MiraklAdapter:${this.marketplace}] Error downloading credit note for order ${marketplaceOrderId}:`, error)
      return null
    }
  }

  /**
   * Fetch customer returns that have been refunded.
   * Uses OR51 / returns listing endpoint: GET /api/returns
   */
  async fetchRefundedReturns(): Promise<any[]> {
    try {
      const token = await this.getAccessToken()
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        const apiKey = this.config.clientSecret === '' || !this.config.clientSecret 
          ? this.config.clientId 
          : this.config.apiKey
        
        if (apiKey) {
          headers['Authorization'] = apiKey
          headers['X-Mirakl-Api-Key'] = apiKey
        }
      }

      const baseUrl = this.config.baseUrl.replace(/\/$/, '')
      let url = ''
      if (baseUrl.includes('miraklconnect.com')) {
        if (baseUrl.endsWith('/v1')) {
          url = `${baseUrl}/returns?max=100`
        } else {
          url = `${baseUrl}/api/v1/returns?max=100`
        }
      } else {
        if (baseUrl.endsWith('/api')) {
          url = `${baseUrl}/returns?max=100`
        } else {
          url = `${baseUrl}/api/returns?max=100`
        }
      }

      if (this.config.shopId) {
        url += `&shop_id=${this.config.shopId}`
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Fetching refunded returns via GET ${url}...`)
      const response = await fetch(url, {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[MiraklAdapter:${this.marketplace}] Returns API not supported (404) for this instance. Skipping return sync.`)
          return []
        }
        const errText = await response.text()
        console.error(`[MiraklAdapter:${this.marketplace}] Fetch returns failed (${response.status}): ${errText}`)
        throw new Error(`Mirakl API returns failed with status ${response.status}`)
      }

      const data = await response.json()
      const returns = data.returns || []
      const refundedReturns = returns.filter((r: any) => r.state === 'REFUNDED' || r.state === 'CLOSED')
      console.log(`[MiraklAdapter:${this.marketplace}] Fetched ${returns.length} returns. ${refundedReturns.length} are refunded/closed.`)
      return refundedReturns
    } catch (error) {
      console.error(`[MiraklAdapter:${this.marketplace}] Error fetching returns:`, error)
      throw error
    }
  }

  async refundOrder(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: unknown
  ): Promise<boolean> {
    console.log(`[MiraklAdapter:${this.marketplace}] Refunding order ${marketplaceOrderId}...`)
    try {
      const token = await this.getAccessToken()
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        const apiKey = this.config.clientSecret === '' || !this.config.clientSecret 
          ? this.config.clientId 
          : this.config.apiKey
        
        if (apiKey) {
          headers['Authorization'] = apiKey
          headers['X-Mirakl-Api-Key'] = apiKey
        }
      }

      // 1. Fetch order details from Mirakl to get order lines and prices
      let miraklOrder = (rawOrderPayload as any)
      if (!miraklOrder || !miraklOrder.order_lines) {
        const baseUrl = this.config.baseUrl.replace(/\/$/, '')
        let orderUrl = ''
        if (baseUrl.includes('miraklconnect.com')) {
          if (baseUrl.endsWith('/v1')) {
            orderUrl = `${baseUrl}/orders?order_ids=${marketplaceOrderId}`
          } else {
            orderUrl = `${baseUrl}/api/v1/orders?order_ids=${marketplaceOrderId}`
          }
        } else {
          if (baseUrl.endsWith('/api')) {
            orderUrl = `${baseUrl}/orders?order_ids=${marketplaceOrderId}`
          } else {
            orderUrl = `${baseUrl}/api/orders?order_ids=${marketplaceOrderId}`
          }
        }

        if (this.config.shopId) {
          orderUrl += `?shop_id=${this.config.shopId}`
        }

        console.log(`[MiraklAdapter:${this.marketplace}] Fetching order details via GET ${orderUrl}...`)
        const response = await fetch(orderUrl, {
          method: 'GET',
          headers
        })

        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`Failed to fetch order details from Mirakl: ${response.status} - ${errText}`)
        }

        const data = await response.json()
        const orders = data.orders || []
        miraklOrder = orders[0]
      }

      if (!miraklOrder || !miraklOrder.order_lines) {
        throw new Error(`No Mirakl order lines found for order ${marketplaceOrderId}`)
      }

      // 2. Map SKUs to order lines and build refund items
      const refunds: any[] = []
      const remainingRefundItems = refundItems.map(i => ({ ...i }))
      
      const shippingRefundIndex = remainingRefundItems.findIndex(ri => ri.sku?.toUpperCase() === 'SHIPPING')
      let shippingAmountToRefund = 0
      if (shippingRefundIndex !== -1) {
        // We only care about the fact that shipping is refunded. If unitPrice is missing, we fall back to miraklOrder.shipping_price
        const originalShipping = miraklOrder.shipping_price || 0
        shippingAmountToRefund = (remainingRefundItems[shippingRefundIndex] as any).unitPrice || originalShipping
        remainingRefundItems.splice(shippingRefundIndex, 1)
      }

      for (const line of miraklOrder.order_lines) {
        const lineSku = line.offer_sku || line.product_sku
        const lineId = line.order_line_id

        const refundIndex = remainingRefundItems.findIndex(ri => ri.sku?.toLowerCase() === lineSku?.toLowerCase())
        if (refundIndex !== -1) {
          const qtyToRefund = Math.min(line.quantity, remainingRefundItems[refundIndex].quantity)
          
          // Get the base unit price
          const priceUnit = line.price_unit || (line.price / line.quantity) || 0

          const isLimango = this.marketplace.toLowerCase().includes('limango') || this.config.baseUrl.includes('limango')
          const defaultReason = isLimango ? '17' : '14'
          const refundPayload: any = {
            order_line_id: lineId,
            amount: parseFloat((priceUnit * qtyToRefund).toFixed(2)),
            quantity: qtyToRefund,
            reason_code: defaultReason, // '14' = Customer return, will fallback to '17' or '111' if rejected
            currency_iso_code: miraklOrder.currency_iso_code || 'EUR'
          }

          if (line.taxes && line.taxes.length > 0) {
            refundPayload.taxes = line.taxes.map((t: any) => {
              const taxAmount = t.amount !== undefined ? Number(t.amount) : (t.rate ? (priceUnit - (priceUnit / (1 + (t.rate / 100)))) * line.quantity : 0)
              return {
                amount: parseFloat(((taxAmount / line.quantity) * qtyToRefund).toFixed(2)),
                code: t.code || 'VAT'
              }
            })
          }

          if (shippingAmountToRefund > 0) {
            let lineShippingRefund = shippingAmountToRefund
            if (line.shipping_price !== undefined && line.shipping_price !== null) {
              lineShippingRefund = Math.min(Number(line.shipping_price), shippingAmountToRefund)
            }

            if (lineShippingRefund > 0) {
              refundPayload.shipping_amount = parseFloat(lineShippingRefund.toFixed(2))
              
              const shippingTaxes = line.shipping_taxes || miraklOrder.shipping_taxes || []
              if (shippingTaxes.length > 0) {
                const totalShippingPrice = miraklOrder.shipping_price || 1
                refundPayload.shipping_taxes = shippingTaxes.map((st: any) => ({
                  amount: parseFloat((Number(st.amount) * (lineShippingRefund / totalShippingPrice)).toFixed(2)),
                  code: st.code || 'VAT'
                }))
              }
              
              shippingAmountToRefund -= lineShippingRefund
            }
          }

          refunds.push(refundPayload)

          remainingRefundItems[refundIndex].quantity -= qtyToRefund
          if (remainingRefundItems[refundIndex].quantity <= 0) {
            remainingRefundItems.splice(refundIndex, 1)
          }
        }
      }

      if (refunds.length === 0) {
        console.warn(`[MiraklAdapter:${this.marketplace}] No matching active order lines found for refund.`)
        return false
      }

      // 3. Put Refund
      const baseUrl = this.config.baseUrl.replace(/\/$/, '')
      let refundUrl = ''
      let reasonUrl = ''
      if (baseUrl.includes('miraklconnect.com')) {
        if (baseUrl.endsWith('/v1')) {
          refundUrl = `${baseUrl}/orders/refund`
          reasonUrl = `${baseUrl}/reasons/REFUND`
        } else {
          refundUrl = `${baseUrl}/api/v1/orders/refund`
          reasonUrl = `${baseUrl}/api/v1/reasons/REFUND`
        }
      } else {
        if (baseUrl.endsWith('/api')) {
          refundUrl = `${baseUrl}/orders/refund`
          reasonUrl = `${baseUrl}/reasons/REFUND`
        } else {
          refundUrl = `${baseUrl}/api/orders/refund`
          reasonUrl = `${baseUrl}/api/reasons/REFUND`
        }
      }
      
      if (this.config.shopId) {
        refundUrl += `?shop_id=${this.config.shopId}`
        reasonUrl += `?shop_id=${this.config.shopId}`
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Sending refund to Mirakl via PUT ${refundUrl}...`)
      let refundResponse = await fetch(refundUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ refunds })
      })

      if (!refundResponse.ok) {
        const errText = await refundResponse.clone().text()
        console.warn(`[MiraklAdapter:${this.marketplace}] Refund failed with default reason: ${refundResponse.status} - ${errText}. Attempting to fetch valid reason codes...`)
        
        try {
          console.log(`[MiraklAdapter:${this.marketplace}] Fetching valid reason codes via GET ${reasonUrl}...`)
          const reasonRes = await fetch(reasonUrl, { method: 'GET', headers })
          if (reasonRes.ok) {
            const reasonData = await reasonRes.json()
            if (reasonData.reasons && reasonData.reasons.length > 0) {
              const validReason = reasonData.reasons.find((r: any) => r.code === '111' || r.code === '14' || r.label?.toLowerCase().includes('return')) || reasonData.reasons[0]
              console.log(`[MiraklAdapter:${this.marketplace}] Found valid reason code: ${validReason.code} (${validReason.label}). Retrying refund...`)
              
              refunds.forEach(r => r.reason_code = validReason.code)
              
              refundResponse = await fetch(refundUrl, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ refunds })
              })
            } else {
              console.warn(`[MiraklAdapter:${this.marketplace}] API returned no valid reason codes.`)
            }
          } else {
             const rErr = await reasonRes.text()
             console.warn(`[MiraklAdapter:${this.marketplace}] Failed to fetch reason codes: ${reasonRes.status} - ${rErr}`)
             
             if (this.marketplace.toLowerCase().includes('limango') || baseUrl.includes('limango')) {
                console.log(`[MiraklAdapter:${this.marketplace}] Using hardcoded reason code 17 for Limango fallback...`)
                refunds.forEach(r => r.reason_code = '17')
                refundResponse = await fetch(refundUrl, {
                  method: 'PUT',
                  headers,
                  body: JSON.stringify({ refunds })
                })
             }
          }
        } catch(e) {
          console.error(`[MiraklAdapter:${this.marketplace}] Exception fetching reason codes for fallback:`, e)
        }

        if (!refundResponse.ok) {
          const errTextFinal = await refundResponse.text()
          console.error(`[MiraklAdapter:${this.marketplace}] Refund failed after retry: ${refundResponse.status} - ${errTextFinal}`)
          throw new Error(`Mirakl Refund API Error: ${errTextFinal || errText}`)
        }
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Refund processed successfully for order ${marketplaceOrderId}`)
      return true
    } catch (error) {
      console.error(`[MiraklAdapter:${this.marketplace}] Error refunding order:`, error)
      return false
    }
  }

  /**
   * Marks a return as received on the marketplace if applicable.
   * Finds the latest open return matching the order ID and calls the RT25 receive endpoint.
   */
  async receiveReturnItems(
    marketplaceOrderId: string,
    refundItems: { sku: string; quantity: number }[],
    rawOrderPayload?: unknown
  ): Promise<boolean | 'ACCEPTED'> {
    try {
      const token = await this.getAccessToken()
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        const apiKey = this.config.clientSecret === '' || !this.config.clientSecret 
          ? this.config.clientId 
          : this.config.apiKey
        
        if (apiKey) {
          headers['Authorization'] = apiKey
          headers['X-Mirakl-Api-Key'] = apiKey
        }
      }

      const baseUrl = this.config.baseUrl.replace(/\/$/, '')
      
      const states = ['IN_PROGRESS', 'WAITING_RECEPTION', 'PENDING_RECEPTION', 'CREATED']
      let returnIdToReceive: string | null = null
      let pageToken: string | null = null
      let pageCount = 0

      console.log(`[MiraklAdapter:${this.marketplace}] Fetching open returns to find RMA for order ${marketplaceOrderId}...`)
      
      do {
        pageCount++
        let url = `${baseUrl}/api/returns?state=${states.join(',')}&limit=100`
        if (this.config.shopId) url += `&shop_id=${this.config.shopId}`
        if (pageToken) url += `&page_token=${encodeURIComponent(pageToken)}`

        const res = await fetch(url, { method: 'GET', headers })
        if (!res.ok) {
          console.warn(`[MiraklAdapter:${this.marketplace}] Failed to fetch returns: ${res.status}`)
          break
        }
        
        const data = await res.json()
        const returns = data.data || data.returns || []
        
        for (const r of returns) {
          if (r.order_id?.includes(marketplaceOrderId) || r.order_commercial_id?.includes(marketplaceOrderId)) {
            returnIdToReceive = r.id
            break
          }
        }
        
        if (returnIdToReceive || returns.length === 0) break
        pageToken = data.next_page_token
      } while (pageToken && pageCount < 20)

      if (!returnIdToReceive) {
        console.log(`[MiraklAdapter:${this.marketplace}] No open return found for order ${marketplaceOrderId}. Skipping receive step.`)
        return false // Not necessarily an error, just no return found
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Marking return ${returnIdToReceive} as received...`)
      
      const receiveUrl = `${baseUrl}/api/returns/receive`
      let receiveOk = false
      const receivePayload = { returns: [{ id: returnIdToReceive }] }
      const receiveRes = await fetch(receiveUrl, { method: 'PUT', headers, body: JSON.stringify(receivePayload) })

      if (!receiveRes.ok) {
        const errText = await receiveRes.text()
        console.warn(`[MiraklAdapter:${this.marketplace}] Failed to mark return ${returnIdToReceive} as received: ${receiveRes.status} - ${errText}`)
      } else {
        const receiveData = await receiveRes.json()
        if (receiveData.return_errors && receiveData.return_errors.length > 0) {
          console.warn(`[MiraklAdapter:${this.marketplace}] Failed to mark return ${returnIdToReceive} as received: ${JSON.stringify(receiveData.return_errors)}`)
        } else {
          receiveOk = true
        }
      }

      if (receiveOk) {
        console.log(`[MiraklAdapter:${this.marketplace}] Marking return ${returnIdToReceive} as accepted (triggering refund)...`)
        const acceptUrl = `${baseUrl}/api/returns/accept`
        const acceptPayload = { returns: [{ id: returnIdToReceive, accepted: true }] }
        const acceptRes = await fetch(acceptUrl, { method: 'PUT', headers, body: JSON.stringify(acceptPayload) })
        if (!acceptRes.ok) {
          console.warn(`[MiraklAdapter:${this.marketplace}] Failed to accept return ${returnIdToReceive}: ${acceptRes.status} - ${await acceptRes.text()}`)
        } else {
          const acceptData = await acceptRes.json()
          if (acceptData.return_errors && acceptData.return_errors.length > 0) {
            console.warn(`[MiraklAdapter:${this.marketplace}] Failed to accept return ${returnIdToReceive}: ${JSON.stringify(acceptData.return_errors)}`)
          } else {
            console.log(`[MiraklAdapter:${this.marketplace}] Return ${returnIdToReceive} accepted successfully!`)
            return 'ACCEPTED'
          }
        }
      }

      return receiveOk
    } catch (error) {
      console.error(`[MiraklAdapter:${this.marketplace}] Error receiving return items:`, error)
      return false
    }
  }

  /**
   * Fetch products/offers from the marketplace for inventory mapping.
   * Uses OF21 endpoint: GET /api/offers
   */
  async fetchProducts(companyId: string): Promise<import('./base').MarketplaceProduct[]> {
    try {
      const token = await this.getAccessToken()
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        const apiKey = this.config.clientSecret === '' || !this.config.clientSecret 
          ? this.config.clientId 
          : this.config.apiKey
        
        if (apiKey) {
          headers['Authorization'] = apiKey
          headers['X-Mirakl-Api-Key'] = apiKey
        }
      }

      const baseUrl = this.config.baseUrl.replace(/\/$/, '')
      let url = `${baseUrl}/api/offers?max=100`
      if (this.config.shopId) {
        url += `&shop_id=${this.config.shopId}`
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Fetching offers via GET ${url}...`)
      
      let allOffers: any[] = []
      let offset = 0
      let hasMore = true
      let retryCount = 0

      while (hasMore) {
        const pagedUrl = `${url}&offset=${offset}`
        const response = await fetch(pagedUrl, { method: 'GET', headers })

        if (response.status === 429 && retryCount < 3) {
          console.warn(`[MiraklAdapter:${this.marketplace}] Rate limited (429). Retrying after 2s...`)
          await new Promise(resolve => setTimeout(resolve, 2000))
          retryCount++
          continue
        }

        if (!response.ok) {
          const errText = await response.text()
          console.error(`[MiraklAdapter:${this.marketplace}] Fetch offers failed (${response.status}): ${errText}`)
          throw new Error(`Mirakl API offers failed with status ${response.status}`)
        }

        const data = await response.json()
        const offers = data.offers || []
        allOffers = allOffers.concat(offers)

        if (offers.length < 100) {
          hasMore = false
        } else {
          offset += 100
          retryCount = 0 // Reset retry count for next page
          // Small delay to prevent rapid-fire requests
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Fetched ${allOffers.length} offers total.`)

      return allOffers.map(offer => ({
        marketplaceProductId: offer.offer_id,
        sku: offer.shop_sku,
        title: offer.product_title || offer.shop_sku,
        price: offer.price,
        stock: offer.quantity,
        rawPayload: offer
      }))
    } catch (error) {
      console.error(`[MiraklAdapter:${this.marketplace}] Error fetching products:`, error)
      throw error
    }
  }

  /**
   * Sync inventory and/or prices back to the marketplace.
   * Uses OF01 endpoint: POST /api/offers
   */
  async updateListings(
    companyId: string, 
    updates: { sku: string; marketplaceProductId?: string; stock?: number; price?: number }[]
  ): Promise<void> {
    if (!updates || updates.length === 0) return

    try {
      const token = await this.getAccessToken()
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        const apiKey = this.config.clientSecret === '' || !this.config.clientSecret 
          ? this.config.clientId 
          : this.config.apiKey
        
        if (apiKey) {
          headers['Authorization'] = apiKey
          headers['X-Mirakl-Api-Key'] = apiKey
        }
      }

      const baseUrl = this.config.baseUrl.replace(/\/$/, '')
      let url = `${baseUrl}/api/offers`
      if (this.config.shopId) {
        url += `?shop_id=${this.config.shopId}`
      }

      // Check if any updates are missing the price field (Mirakl OF01 requires price)
      const needsPriceFetch = updates.some(u => u.price === undefined)
      const currentOffersMap: Record<string, number> = {}

      if (needsPriceFetch) {
        console.log(`[MiraklAdapter:${this.marketplace}] Some updates are missing price. Fetching existing offers to fill mandatory price field...`)
        try {
          let offset = 0
          let retryCount = 0
          while (true) {
            const fetchUrl = url.includes('?') 
              ? `${url}&max=100&offset=${offset}`
              : `${url}?max=100&offset=${offset}`
              
            const res = await fetch(fetchUrl, { headers })
            
            if (res.status === 429 && retryCount < 3) {
              console.warn(`[MiraklAdapter:${this.marketplace}] Rate limited (429) during price fetch. Retrying after 2s...`)
              await new Promise(r => setTimeout(r, 2000))
              retryCount++
              continue
            }
            
            if (!res.ok) break
            const data = await res.json()
            if (!data.offers || data.offers.length === 0) break
            
            for (const offer of data.offers) {
              if (offer.shop_sku && offer.price !== undefined) {
                currentOffersMap[offer.shop_sku] = offer.price
              }
            }
            
            if (data.offers.length < 100) break
            offset += 100
            retryCount = 0
            
            // Add a small delay between requests to prevent hitting rate limits
            await new Promise(r => setTimeout(r, 500))
          }
          console.log(`[MiraklAdapter:${this.marketplace}] Fetched ${Object.keys(currentOffersMap).length} existing offers.`)
        } catch (e) {
          console.warn(`[MiraklAdapter:${this.marketplace}] Failed to fetch existing offers for price fallback:`, e)
        }
      }

      // Format payload for Mirakl OF01
      const offers = updates.map(update => {
        const offer: any = {
          shop_sku: update.sku,
          update_delete: 'update'
        }
        if (update.stock !== undefined) offer.quantity = update.stock
        
        // Price is mandatory in Mirakl OF01
        if (update.price !== undefined) {
          offer.price = update.price
        } else if (currentOffersMap[update.sku] !== undefined) {
          offer.price = currentOffersMap[update.sku]
        }
        
        return offer
      })

      console.log(`[MiraklAdapter:${this.marketplace}] Updating ${offers.length} offers via POST ${url}...`)
      
      const chunkSize = 1000
      for (let i = 0; i < offers.length; i += chunkSize) {
        const chunk = offers.slice(i, i + chunkSize)
        let retryCount = 0
        let success = false
        
        while (!success && retryCount < 3) {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ offers: chunk })
          })

          if (response.status === 429) {
            console.warn(`[MiraklAdapter:${this.marketplace}] Rate limited (429) during offer update chunk (${i}-${i + chunk.length}). Retrying after 5s...`)
            await new Promise(r => setTimeout(r, 5000))
            retryCount++
            continue
          }

          if (!response.ok) {
            const errText = await response.text()
            console.error(`[MiraklAdapter:${this.marketplace}] Update offers chunk failed (${response.status}): ${errText}`)
            throw new Error(`Mirakl API offer update failed: ${errText}`)
          }
          
          success = true
        }
        
        if (!success) {
          throw new Error(`Mirakl API offer update failed after ${retryCount} retries.`)
        }
        
        if (i + chunkSize < offers.length) {
          // Delay between chunks to prevent rate limiting
          await new Promise(r => setTimeout(r, 1000))
        }
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Offers successfully updated.`)
    } catch (error) {
      console.error(`[MiraklAdapter:${this.marketplace}] Error updating listings:`, error)
      throw error
    }
  }
}

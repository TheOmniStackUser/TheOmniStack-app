// ============================================================================
// MIRAKL ADAPTER (Stub)
// Mirakl is the white-label marketplace platform used by Decathlon, MediaMarkt, etc.
// Each Mirakl instance has its own base URL but a unified API contract.
// Reference: https://developer.mirakl.net/api-reference
// ============================================================================

import type { MarketplaceAdapter, NormalizedOrder } from './base'

type MiraklInstance = 'mirakl_decathlon' | 'mirakl_decathlon_eu' | 'mirakl_mediamarkt'

type MiraklAdapterConfig = {
  instance: MiraklInstance
  baseUrl: string // e.g. 'https://decathlon.mirakl.net'
  clientId: string
  clientSecret: string
  apiKey?: string // Stores 'audience' for OAuth2
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
      console.log(`[MiraklAdapter:${this.marketplace}] Requesting OAuth2 token from auth.mirakl.net...`)
      
      const params = new URLSearchParams()
      params.append('grant_type', 'client_credentials')
      params.append('client_id', this.config.clientId)
      params.append('client_secret', this.config.clientSecret)
      
      // The 'apiKey' field in our DB stores the 'audience' (Company ID) for Mirakl
      if (this.config.apiKey) {
        params.append('audience', this.config.apiKey)
      }
      
      const response = await fetch('https://auth.mirakl.net/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      })

      if (!response.ok) {
        const errText = await response.text()
        console.warn(`[MiraklAdapter:${this.marketplace}] OAuth2 failed (${response.status}): ${errText}. Falling back to API Key.`)
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
        headers['Authorization'] = this.config.clientId
        headers['X-Mirakl-Api-Key'] = this.config.clientId
      }

      console.log(`[MiraklAdapter:${this.marketplace}] Fetching unshipped orders from ${this.config.baseUrl}...`)
      console.log(`[MiraklAdapter:${this.marketplace}] Headers: ${JSON.stringify({ ...headers, 'Authorization': 'REDACTED', 'X-Mirakl-Api-Key': 'REDACTED' })}`)
      
      let url = `${this.config.baseUrl}/api/orders?order_state_codes=SHIPPING,WAITING_ACCEPTANCE&max=100`
      if (options?.fromDate) url += `&start_date=${options.fromDate}T00:00:00Z`
      if (options?.toDate) url += `&end_date=${options.toDate}T23:59:59Z`

      const response = await fetch(url, {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Mirakl API Error ${response.status}: ${errText}`)
      }

      const data = await response.json()
      const rawOrders = data.orders || []
      
      console.log(`[MiraklAdapter:${this.marketplace}] Fetched ${rawOrders.length} raw orders.`)

      return rawOrders.map((raw: any) => this.normalizeOrder(companyId, raw))
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
      
      totalAmount += line.total_price || (price * qty)
      taxAmount += line.total_tax || ((price * qty) * taxRate)

      return {
        sku: line.offer_sku || line.product_sku || 'UNKNOWN',
        title: line.product_title || 'Mirakl Product',
        quantity: qty,
        unitPrice: price,
        taxRate: taxRate,
      }
    })

    return {
      marketplace: this.marketplace,
      marketplaceOrderId: raw.order_id,
      purchaseDate: new Date(raw.created_date || Date.now()),
      buyer: {
        name: `${billing.firstname || ''} ${billing.lastname || ''}`.trim() || 'Mirakl Customer',
        email: customer.customer_id ? `${customer.customer_id}@mirakl.net` : 'no-reply@mirakl.net',
      },
      shippingAddress: {
        name: `${shipping.firstname || ''} ${shipping.lastname || ''}`.trim(),
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
  async uploadInvoice(orderId: string, pdfBuffer: Buffer, fileName: string): Promise<boolean> {
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
      
      // Document type 'INVOICE'
      formData.append('document_type_code', 'INVOICE')

      const url = `${this.config.baseUrl}/api/orders/${orderId}/documents`
      console.log(`[MiraklAdapter:${this.marketplace}] Uploading invoice ${fileName} for order ${orderId}...`)

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
}

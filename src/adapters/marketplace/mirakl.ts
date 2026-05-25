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

      const response = await fetch(url, {
        method: 'GET',
        headers
      })

      const bodyText = await response.text()
      console.log(`[MiraklAdapter:${this.marketplace}] Response start: ${bodyText.substring(0, 50).replace(/\n/g, ' ')}`)
      
      if (!response.ok) {
        console.error(`[MiraklAdapter:${this.marketplace}] API Error ${response.status}: ${bodyText.substring(0, 500)}`)
        throw new Error(`Mirakl API Error ${response.status}: ${bodyText.substring(0, 100)}`)
      }

      if (bodyText.trim().startsWith('<!DOCTYPE') || bodyText.trim().startsWith('<html')) {
        console.error(`[MiraklAdapter:${this.marketplace}] API returned HTML instead of JSON: ${bodyText.substring(0, 500)}`)
        throw new Error(`Mirakl API returned HTML instead of JSON (likely a redirect or 404)`)
      }

      const data = JSON.parse(bodyText)
      const rawOrders = data.orders || []
      
      console.log(`[MiraklAdapter:${this.marketplace}] Fetched ${rawOrders.length} raw orders.`)

      // Auto-accept orders in WAITING_ACCEPTANCE state
      const waitingAcceptanceOrders = rawOrders.filter((raw: any) => raw.order_state === 'WAITING_ACCEPTANCE')
      if (waitingAcceptanceOrders.length > 0) {
        console.log(`[MiraklAdapter:${this.marketplace}] Found ${waitingAcceptanceOrders.length} orders in WAITING_ACCEPTANCE state. Auto-accepting...`)
        for (const raw of waitingAcceptanceOrders) {
          const lines = (raw.order_lines || []).map((line: any) => ({
            id: line.order_line_id,
            accepted: true
          }))
          if (lines.length > 0) {
            await this.acceptOrder(raw.order_id, lines)
          } else {
            console.warn(`[MiraklAdapter:${this.marketplace}] Order ${raw.order_id} has no order lines, skipping auto-accept.`)
          }
        }
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
}

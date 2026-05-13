import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

export class HermesAdapter {
  private integrationId: string | null
  private accessToken: string | null
  private baseUrl: string = 'https://de-api.myhermes.de'
  private authUrl: string = 'https://authme.myhermes.de/authorization-facade/oauth2/access_token'

  // Application credentials (identifies this software as TheOmniStack)
  private appId: string = 'hsi.verm.theomnistack'
  private appSecret: string = 'B6LSgC-5tTYQyThjTa61'
  
  // User credentials (identifies the business customer - set via DB)
  private username: string
  private password: string

  constructor(
    integrationId: string | null = null, 
    accessToken: string | null = null,
    username: string = '',
    password: string = ''
  ) {
    this.integrationId = integrationId
    this.accessToken = accessToken
    this.username = username
    this.password = password
  }

  private splitStreet(full: string | null | undefined): { street: string; houseNo: string } {
    if (!full) return { street: '', houseNo: '.' }
    const match = full.match(/^(.+?)\s+([\d\-\/]+\s*[a-zA-Z]*)$/)
    if (match) return { street: match[1].trim(), houseNo: match[2].trim().slice(0, 10) }
    const parts = full.trim().split(/\s+/)
    if (parts.length > 1) {
      const last = parts.pop()!
      return { street: parts.join(' ').trim(), houseNo: last.slice(0, 10) }
    }
    return { street: full.trim(), houseNo: '.' }
  }

  static async initialize(companyId: string): Promise<HermesAdapter> {
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.type, 'hermes'),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
      .limit(1)

    // If not configured in DB, throw a clear error instead of silently using wrong credentials
    if (!integration || !integration.clientId) {
      throw new Error('Hermes ist nicht konfiguriert. Bitte trage deine Hermes GKP-Zugangsdaten unter Integrationen ein.')
    }

    return new HermesAdapter(
      integration.id, 
      integration.accessToken,
      integration.clientId,   // GKP Username stored in clientId field
      integration.clientSecret ?? '' // GKP Password stored in clientSecret field
    )
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken
    }

    console.log('[Hermes Adapter] Getting access token...')
    
    const response = await fetch(this.authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: this.appId,
        client_secret: this.appSecret,
        username: this.username,
        password: this.password
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[Hermes Adapter] Auth Error:', errText)
      throw new Error(`Hermes Auth Fehler: ${response.status} - ${errText}`)
    }

    const data = await response.json()
    this.accessToken = data.access_token
    return data.access_token
  }

  async generateLabelForOrder(
    order: any, 
    company: any, 
    parcelClass: string = 'S'
  ): Promise<{ labelUrl: string, trackingNumber: string }> {
    console.log(`[Hermes Adapter] Generiere Versandetikett für Bestellung ${order.marketplaceOrderId || order.id} (Klasse: ${parcelClass})...`)

    const token = await this.getAccessToken()

    // Map class to max volume (dl)
    const volumeMap: Record<string, number> = {
      'XS': 10,
      'S': 50,
      'M': 150,
      'L': 450,
      'XL': 4500
    }
    const parcelVolume = volumeMap[parcelClass] || 50
    const recipientAddr = this.splitStreet(order.shippingStreet)
    const shipperAddr = this.splitStreet(company.warehouseStreet || company.street)

    // Try to find a human-readable order number (especially for Otto where marketplaceOrderId might be a UUID)
    let displayOrderId = order.marketplaceOrderId
    if (order.marketplace === 'otto' && order.rawPayload?.orderNumber) {
      displayOrderId = order.rawPayload.orderNumber
    } else if (order.marketplace === 'aboutyou' && order.rawPayload?.order_number) {
      displayOrderId = order.rawPayload.order_number
    }

    const payload = {
      clientReference: displayOrderId ? displayOrderId.slice(0, 20) : order.id.slice(0, 20),
      receiverName: {
        firstname: order.shippingName?.split(' ')[0] || 'Vorname',
        lastname: order.shippingName?.split(' ').slice(1).join(' ') || 'Nachname'
      },
      receiverAddress: {
        street: recipientAddr.street || 'Strasse',
        houseNumber: recipientAddr.houseNo === '.' ? '1' : recipientAddr.houseNo,
        zipCode: order.shippingZip || '12345',
        town: order.shippingCity || 'Stadt',
        countryCode: order.shippingCountry === 'DE' ? 'DE' : (order.shippingCountry?.slice(0, 2) || 'DE')
      },
      senderName: {
        firstname: 'Versand',
        lastname: company.name || 'Absender'
      },
      senderAddress: {
        street: shipperAddr.street || 'Hauptstrasse',
        houseNumber: shipperAddr.houseNo === '.' ? '1' : shipperAddr.houseNo,
        zipCode: company.warehouseZip || company.zip || '53113',
        town: company.warehouseCity || company.city || 'Bonn',
        countryCode: 'DE'
      },
      parcel: {
        parcelWeight: order.totalWeight ? Math.round(Number(order.totalWeight) * 1000) : 1000, // weight in grams
        parcelClass: parcelClass,   // Mandatory for Self-Service / Digital Sales
        parcelVolume: parcelVolume,  // Mandatory for Self-Service (in dl)
        productType: 'PARCEL'
      },
      service: {
        customerAlertService: {
          notificationEmail: order.buyerEmail || 'no-reply@hermes.de',
          notificationType: 'EMAIL'
        }
      }
    }

    const response = await fetch(`${this.baseUrl}/services/hsi/shipmentorders/labels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/shippinglabel-pdf+json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[Hermes Adapter] Label Error:', errText)
      throw new Error(`Hermes API Fehler: ${response.status} - ${errText}`)
    }

    const data = await response.json()
    
    // HSI returns tracking number in shipmentID or similar field depending on the exact version
    // Usually it's data.shipmentID or data.shipmentOrder.shipmentID
    const trackingNumber = data.shipmentID || data.shipmentOrder?.shipmentID || 'HERMES-' + Date.now()
    
    // Label is base64 in labelImage
    const base64 = data.labelImage
    if (!base64) {
      throw new Error('Hermes API hat kein Label (labelImage) zurückgegeben.')
    }
    
    const labelUrl = `data:application/pdf;base64,${base64}`

    return {
      labelUrl,
      trackingNumber
    }
  }

  async getShipmentInfo(shipmentId: string): Promise<any> {
    console.log(`[Hermes Adapter] Suche Daten für Barcode/ID ${shipmentId}...`)
    const token = await this.getAccessToken()

    const today = new Date().toISOString().split('T')[0]

    const response = await fetch(`${this.baseUrl}/services/hsi/shipmentorders?barcode=${shipmentId}&fromCreationDate=${today}&toCreationDate=${today}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[Hermes Adapter] Get Shipment Error:', errText)
      throw new Error(`Hermes API Fehler: ${response.status} - ${errText}`)
    }

    return await response.json()
  }
}

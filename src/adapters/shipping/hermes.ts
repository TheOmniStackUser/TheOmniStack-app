import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

export class HermesAdapter {
  private integrationId: string | null
  private accessToken: string | null
  // PRODUKTIONSUMGEBUNG
  private baseUrl: string = 'https://de-api.hermesworld.com'
  private authUrl: string = 'https://authme.myhermes.de/authorization-facade/oauth2/access_token'

  // Application credentials – Produktion
  private appId: string = 'hsi.verm.theomnistack'
  private appSecret: string = 'B6LSgC-5tTYQyThjTa61'
  
  // User credentials (identifies the business customer - set via DB)
  private username: string
  private password: string
  private config: any = null

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

  public setConfig(config: any) {
    if (typeof config === 'string') {
      try {
        this.config = JSON.parse(config)
      } catch (e) {
        console.error('[Hermes Adapter] Failed to parse config string:', e)
        this.config = config
      }
    } else {
      this.config = config
    }
    console.log('[Hermes Adapter] Config loaded:', JSON.stringify(this.config))
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

    const adapter = new HermesAdapter(
      integration.id, 
      integration.accessToken,
      integration.clientId,   // GKP Username stored in clientId field
      integration.clientSecret ?? '' // GKP Password stored in clientSecret field
    )

    if (integration.metadata) {
      adapter.setConfig(integration.metadata)
    }

    return adapter
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
      
      let isCredentialError = false
      try {
        const parsed = JSON.parse(errText)
        if (parsed.error === 'invalid_grant' || parsed.error_description?.toLowerCase().includes('credential')) {
          isCredentialError = true
        }
      } catch (e) {
        if (errText.includes('invalid_grant') || errText.includes('credentials')) {
          isCredentialError = true
        }
      }

      if (response.status === 401 || isCredentialError) {
        throw new Error('Ungültige Hermes-Zugangsdaten. Bitte überprüfe deinen Benutzernamen und dein Passwort unter Integrationen > Hermes Versand.')
      }

      throw new Error(`Hermes Auth Fehler: ${response.status} - ${errText}`)
    }

    const data = await response.json()
    console.log('[Hermes Adapter] API Response:', JSON.stringify(data, null, 2))
    
    const labelUrl = data.labelImage || data.shipmentOrder?.labelImage || data.labelImage?.[0]
    this.accessToken = data.access_token
    return data.access_token
  }

  // Public method to test if credentials are valid by requesting an access token
  async testAuth(): Promise<string> {
    // Force a fresh token fetch (don't use cached)
    this.accessToken = null
    return this.getAccessToken()
  }

  async generateLabelForOrder(
    order: any, 
    company: any, 
    parcelClass: string = 'S'
  ): Promise<{ labelUrl: string, returnLabelUrl?: string, trackingNumber: string, returnTrackingNumber?: string }> {
    console.log(`[Hermes Adapter] Generiere Versandetikett für Bestellung ${order.marketplaceOrderId || order.id} (Klasse: ${parcelClass})...`)

    if (!company || !company.street || !company.zip || !company.city) {
      throw new Error('Keine Rechnungsadresse hinterlegt. Bitte trage deine Rechnungsadresse in den Firmeinstellungen ein.')
    }

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
        firstname: '',
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
      service: {}
    }
    // Check for return configuration
    const marketplace = (order.marketplace || 'unknown').toLowerCase()
    let returnType = this.config?.platformReturns?.[marketplace] || 'none'
    
    // AUTO-FIX: Otto ALWAYS requires a return number.
    if (marketplace === 'otto' && returnType === 'none') {
      console.log(`[Hermes Adapter] Auto-fixing returnType to 'virtual' for Otto shipment.`)
      returnType = 'virtual'
    }

    console.log(`[Hermes Adapter] Return Config Check: marketplace=${marketplace}, returnType=${returnType}, integrationId=${this.integrationId}`)

    console.log('[Hermes Adapter] Final Payload:', JSON.stringify(payload))

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/services/hsi/shipmentorders/labels`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/shippinglabel-pdf+json'
        },
        body: JSON.stringify(payload)
      })
    } catch (fetchError: any) {
      console.error('[Hermes Adapter] Network/Fetch Error:', fetchError)
      throw new Error(`Hermes API Verbindung fehlgeschlagen: ${fetchError.message || 'Netzwerkfehler'}`)
    }

    if (!response.ok) {
      const errText = await response.text()
      let friendlyMsg = errText
      try {
        const parsed = JSON.parse(errText)
        if (parsed.listOfResultCodes && parsed.listOfResultCodes.length > 0) {
          friendlyMsg = parsed.listOfResultCodes.map((r: any) => {
            const msg = r.message || ''
            if (msg.includes('receiverAddress - houseNumber') || msg.includes('houseNumber')) {
              return 'Die Hausnummer der Lieferadresse fehlt oder ist ungültig.'
            }
            if (msg.includes('receiverAddress - zipCode') || msg.includes('zipCode')) {
              return 'Die Postleitzahl (PLZ) der Lieferadresse fehlt oder ist ungültig.'
            }
            if (msg.includes('receiverAddress - street') || msg.includes('street')) {
              return 'Der Straßenname der Lieferadresse ist ungültig.'
            }
            if (msg.includes('receiverAddress - town') || msg.includes('town')) {
              return 'Der Ort/die Stadt der Lieferadresse ist ungültig.'
            }
            return msg
          }).join('; ')
        } else if (parsed.message) {
          friendlyMsg = parsed.message
        }
      } catch (e) {
        // Fallback if not JSON
      }
      throw new Error(friendlyMsg)
    }

    const data = await response.json()
    console.log('[Hermes Adapter] Outbound label response:', JSON.stringify(data, null, 2))

    // The shipmentID is the 20-digit Hermes shipment number (pattern: H + 19 digits + 14 digits)
    // It is REQUIRED in the return label request for Self-Service customers
    const trackingNumber = data.shipmentID || data.shipmentOrder?.shipmentID || data.barcode || data.shipmentOrder?.barcode || 'HERMES-' + Date.now()
    
    const base64 = data.labelImage || data.shipmentOrder?.labelImage
    if (!base64) {
      throw new Error('Hermes API hat kein Label (labelImage) zurückgegeben.')
    }
    
    const labelUrl = `data:application/pdf;base64,${base64}`
    let returnLabelUrl: string | undefined = undefined
    let returnTrackingNumber: string | undefined = undefined

    // Hermes Self-Service Return Flow:
    // Self-Service customers (300–100k shipments/year) MUST pass the shipmentID of the
    // outbound shipment in the return label request. Enterprise customers (100k+) can
    // create returns standalone. We always use the Self-Service flow (shipmentID required).
    // Endpoint: POST /returnorders/labels  →  body: { shipmentID: "<outbound shipmentID>" }
    if (returnType === 'enclosed' || returnType === 'virtual') {
      console.log(`[Hermes Adapter] Requesting Self-Service return label via /returnorders/labels (Typ: ${returnType}, outbound shipmentID: ${trackingNumber})`)
      
      // Validate that we have a real shipmentID (not a fallback timestamp placeholder)
      if (!trackingNumber || trackingNumber.startsWith('HERMES-')) {
        console.warn('[Hermes Adapter] WARNUNG: Keine gültige shipmentID für Retourenlabel – überspringe.')
      } else {
        try {
          // Self-Service return payload: only shipmentID is required.
          // The sender/receiver are automatically derived from the outbound shipment.
          const returnPayload: any = {
            shipmentID: trackingNumber
          }

          console.log('[Hermes Adapter] Return label payload:', JSON.stringify(returnPayload))

          const returnResponse = await fetch(`${this.baseUrl}/services/hsi/returnorders/labels`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/shippinglabel-pdf+json'
            },
            body: JSON.stringify(returnPayload)
          })

          const returnRawText = await returnResponse.text()
          console.log(`[Hermes Adapter] Return label response ${returnResponse.status}:`, returnRawText)

          if (returnResponse.ok) {
            let returnData: any
            try { returnData = JSON.parse(returnRawText) } catch { returnData = {} }

            const returnResultCode = returnData.listOfResultCodes?.[0]?.code
            console.log('[Hermes Adapter] Return Label result codes:', JSON.stringify(returnData.listOfResultCodes))

            if (returnResultCode === 'OK' || returnData.shipmentID) {
              returnTrackingNumber = returnData.shipmentID
              // Only generate a PDF label for 'enclosed' type (needs to be printed & put in parcel).
              // For 'virtual' (e.g. Otto), we only need the tracking number – no label PDF.
              if (returnType === 'enclosed') {
                const returnBase64 = returnData.shippinglabel || returnData.labelImage
                if (returnBase64 && typeof returnBase64 === 'string' && returnBase64.length > 100) {
                  returnLabelUrl = `data:application/pdf;base64,${returnBase64}`
                  console.log(`[Hermes Adapter] ✅ Retourenlabel-PDF generiert. Return Tracking: ${returnTrackingNumber}`)
                } else {
                  console.warn('[Hermes Adapter] Return Label: kein shippinglabel-PDF in Antwort.')
                }
              } else {
                console.log(`[Hermes Adapter] ✅ Retourennummer erhalten (kein PDF für '${returnType}'): ${returnTrackingNumber}`)
              }
            } else {
              console.warn(`[Hermes Adapter] Retourenlabel Fehler:`, JSON.stringify(returnData.listOfResultCodes))
            }
          } else {
            console.warn(`[Hermes Adapter] Return label request failed: ${returnResponse.status} - ${returnRawText}`)
          }
        } catch (returnError: any) {
          console.warn(`[Hermes Adapter] Return label request threw:`, returnError.message)
        }

        if (!returnTrackingNumber) {
          console.warn(`[Hermes Adapter] WARNUNG: Kein Self-Service Retourenlabel erhalten (Marktplatz: ${marketplace}, shipmentID: ${trackingNumber}).`)
        }
      }
    }

    return {
      labelUrl,
      returnLabelUrl,
      trackingNumber,
      returnTrackingNumber
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

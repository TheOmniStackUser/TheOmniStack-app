import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import { XMLParser } from 'fast-xml-parser'
import { splitStreet } from '@/lib/postal-codes'
import { getOrderDisplayNumber } from '@/lib/order-number'

export interface DpdConfig {
  delisId: string
  password: string
  depot?: string
  customerNumber?: string
  environment?: 'production' | 'stage'
  defaultWeight?: number
  labelFormat?: 'A6' | 'A4'
}

export class DpdAdapter {
  private integrationId: string | null
  private config: DpdConfig
  private cachedAuthToken: string | null = null
  private cachedDepot: string | null = null

  constructor(integrationId: string | null = null, config: DpdConfig) {
    this.integrationId = integrationId
    this.config = config
  }

  private get loginUrl(): string {
    return this.config.environment === 'stage'
      ? 'https://public-dis-stage.dpd.com/Services/LoginService.svc'
      : 'https://public-dis.dpd.com/Services/LoginService.svc'
  }

  private get shipmentUrl(): string {
    return this.config.environment === 'stage'
      ? 'https://public-dis-stage.dpd.com/Services/ShipmentService.svc'
      : 'https://public-dis.dpd.com/Services/ShipmentService.svc'
  }

  static async initialize(companyId: string): Promise<DpdAdapter> {
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.type, 'dpd'),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
      .limit(1)

    if (!integration || !integration.clientId) {
      throw new Error('DPD ist nicht konfiguriert. Bitte trage deine DPD DelisID und Zugangsdaten unter Integrationen > DPD Versand ein.')
    }

    const metadata = (integration.metadata as Partial<DpdConfig>) || {}
    const config: DpdConfig = {
      delisId: integration.clientId,
      password: integration.clientSecret || '',
      depot: metadata.depot,
      customerNumber: metadata.customerNumber,
      environment: (integration.environment as 'production' | 'stage') || metadata.environment || 'production',
      defaultWeight: metadata.defaultWeight ?? 1.0,
      labelFormat: metadata.labelFormat ?? 'A6',
    }

    return new DpdAdapter(integration.id, config)
  }

  private escapeXml(str: string | null | undefined): string {
    if (!str) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  private parseXml(xmlText: string): any {
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: false,
      trimValues: true,
    })
    return parser.parse(xmlText)
  }

  /**
   * Authenticates with DPD LoginService.svc
   * Returns authToken, depot, customerNumber and customerName
   */
  async getAuth(): Promise<{
    authToken: string
    depot: string
    customerNumber?: string
    customerName?: string
  }> {
    if (this.cachedAuthToken && this.cachedDepot) {
      return {
        authToken: this.cachedAuthToken,
        depot: this.cachedDepot,
        customerNumber: this.config.customerNumber,
      }
    }

    const { delisId, password } = this.config
    if (!delisId || !password) {
      throw new Error('DPD Zugangsdaten unvollständig: DelisID oder Passwort fehlt.')
    }

    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://dpd.com/common/service/types/LoginService/2.0">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:getAuth>
      <delisId>${this.escapeXml(delisId)}</delisId>
      <password>${this.escapeXml(password)}</password>
      <messageLanguage>de_DE</messageLanguage>
    </ns:getAuth>
  </soapenv:Body>
</soapenv:Envelope>`

    console.log(`[DPD Adapter] Authenticating with ${this.loginUrl} for DelisID ${delisId}...`)

    let response: Response
    try {
      response = await fetch(this.loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '"http://dpd.com/common/service/LoginService/2.0/getAuth"',
        },
        body: soapEnvelope,
      })
    } catch (networkErr: any) {
      console.error('[DPD Adapter] Network error during getAuth:', networkErr)
      throw new Error(`DPD Login-Verbindung fehlgeschlagen: ${networkErr.message || 'Netzwerkfehler'}`)
    }

    const responseText = await response.text()
    const parsed = this.parseXml(responseText)

    const envelope = parsed.Envelope || parsed['soapenv:Envelope'] || parsed
    const body = envelope?.Body || envelope?.['soapenv:Body']

    if (!response.ok || body?.Fault) {
      const fault = body?.Fault
      const faultMsg = fault?.faultstring || fault?.detail || responseText
      console.error('[DPD Adapter] Auth SOAP Fault:', faultMsg)
      throw new Error(`DPD Login fehlgeschlagen: ${faultMsg}`)
    }

    const authReturn = body?.getAuthResponse?.return
    if (!authReturn) {
      console.error('[DPD Adapter] Unexpected auth response:', responseText)
      throw new Error('DPD Login lieferte keine gültige Antwort (kein return-Element).')
    }

    const authToken = authReturn.authToken
    const depot = authReturn.depot || this.config.depot || ''

    let customerNumber = this.config.customerNumber
    let customerName: string | undefined

    const customerList = authReturn.customerList
    if (customerList) {
      if (Array.isArray(customerList)) {
        customerNumber = customerNumber || customerList[0]?.customerNumber
        customerName = customerList[0]?.customerName
      } else if (typeof customerList === 'object') {
        customerNumber = customerNumber || customerList.customerNumber
        customerName = customerList.customerName
      }
    }

    this.cachedAuthToken = authToken
    this.cachedDepot = depot

    console.log(`[DPD Adapter] Auth success! Depot: ${depot}, Customer: ${customerNumber || 'n/a'}`)

    return {
      authToken,
      depot,
      customerNumber,
      customerName,
    }
  }

  /**
   * Tests whether the credentials are valid
   */
  async testConnection(): Promise<{
    success: boolean
    depot?: string
    customerNumber?: string
    customerName?: string
    error?: string
  }> {
    try {
      this.cachedAuthToken = null
      this.cachedDepot = null
      const auth = await this.getAuth()
      return {
        success: true,
        depot: auth.depot,
        customerNumber: auth.customerNumber,
        customerName: auth.customerName,
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Unbekannter DPD Verbindungsfehler',
      }
    }
  }

  /**
   * Generates a shipping label for an order via ShipmentService.svc/storeOrders
   */
  async generateLabelForOrder(
    order: any,
    company: any,
    options?: {
      weight?: number
      labelFormat?: 'A6' | 'A4'
    }
  ): Promise<{
    labelUrl: string
    trackingNumber: string
    trackingUrl: string
  }> {
    const auth = await this.getAuth()
    const sendingDepot = this.config.depot || auth.depot
    if (!sendingDepot) {
      throw new Error('DPD Depot-Nummer fehlt. Bitte in den DPD-Einstellungen hinterlegen.')
    }

    // Shipper address
    const shipperStreetInfo = splitStreet(company.warehouseStreet || company.street)
    const shipperStreet = (shipperStreetInfo.street || 'Hauptstraße').slice(0, 50)
    const shipperHouseNo = (shipperStreetInfo.houseNo === '.' ? '1' : (shipperStreetInfo.houseNo || '1')).slice(0, 10)
    const shipperZip = (company.warehouseZip || company.zip || '53113').trim().slice(0, 10)
    const shipperCity = (company.warehouseCity || company.city || 'Bonn').trim().slice(0, 50)
    const shipperCountry = (company.warehouseCountry || company.country || 'DE').trim().slice(0, 2).toUpperCase()
    const shipperName = (company.name || 'Absender').trim().slice(0, 50)
    const shipperEmail = (company.email || '').trim().slice(0, 50)
    const shipperPhone = (company.phone || '').trim().slice(0, 30)

    // Recipient address
    const recipientStreetInfo = splitStreet(order.shippingStreet)
    let recipientStreet = (recipientStreetInfo.street || 'Straße').trim()
    let recipientHouseNo = recipientStreetInfo.houseNo === '.' ? '' : recipientStreetInfo.houseNo.trim()

    // Auto-fix if house number is in address addition (e.g. Mirakl / Limango)
    if (!recipientHouseNo && order.shippingAddressAddition) {
      if (/^[\d\-\/]+\s*[a-zA-Z]*$/.test(order.shippingAddressAddition.trim())) {
        recipientHouseNo = order.shippingAddressAddition.trim()
      }
    }
    if (!recipientHouseNo) {
      recipientHouseNo = '1'
    }

    recipientStreet = recipientStreet.slice(0, 50)
    recipientHouseNo = recipientHouseNo.slice(0, 10)

    let recipientName1 = (order.shippingCompany || order.shippingName || 'Empfänger').trim().slice(0, 50)
    let recipientName2 = ''
    if (order.shippingCompany && order.shippingName) {
      recipientName2 = order.shippingName.trim().slice(0, 50)
    } else if (order.shippingAddressAddition && !/^[\d\-\/]+\s*[a-zA-Z]*$/.test(order.shippingAddressAddition.trim())) {
      recipientName2 = order.shippingAddressAddition.trim().slice(0, 50)
    }

    const recipientZip = (order.shippingZip || '').trim().slice(0, 10)
    const recipientCity = (order.shippingCity || '').trim().slice(0, 50)
    const recipientCountry = (order.shippingCountry || 'DE').trim().slice(0, 2).toUpperCase()
    const recipientEmail = (order.buyerEmail || '').trim().slice(0, 50)
    const recipientPhone = (order.shippingPhone || '').trim().slice(0, 30)

    // Calculate weight: DPD uses decagrams (10 grams). 1.0 kg = 100 decagrams. Min 10.
    const rawWeightKg = options?.weight ?? (order.totalWeight ? Number(order.totalWeight) : (this.config.defaultWeight ?? 1.0))
    const weightDecagrams = Math.max(10, Math.round(rawWeightKg * 100))

    const paperFormat = options?.labelFormat || this.config.labelFormat || 'A6'
    const displayOrderId = getOrderDisplayNumber(order) || order.marketplaceOrderId || order.id
    const customerRef = String(displayOrderId).slice(0, 35)

    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://dpd.com/common/service/types/ShipmentService/3.3">
  <soapenv:Header>
    <ns1:authentication xmlns:ns1="http://dpd.com/common/service/types/Authentication/2.0">
      <delisId>${this.escapeXml(this.config.delisId)}</delisId>
      <authToken>${this.escapeXml(auth.authToken)}</authToken>
      <messageLanguage>de_DE</messageLanguage>
    </ns1:authentication>
  </soapenv:Header>
  <soapenv:Body>
    <ns:storeOrders>
      <printOptions>
        <printType>PDF</printType>
        <paperFormat>${paperFormat}</paperFormat>
      </printOptions>
      <order>
        <generalShipmentData>
          <mpsId>${this.escapeXml(customerRef)}</mpsId>
          ${shipperEmail ? `<cMailAddress>${this.escapeXml(shipperEmail)}</cMailAddress>` : ''}
          <sendingDepot>${this.escapeXml(sendingDepot)}</sendingDepot>
          <product>CL</product>
          <sender>
            <name1>${this.escapeXml(shipperName)}</name1>
            <street>${this.escapeXml(shipperStreet)}</street>
            <houseNo>${this.escapeXml(shipperHouseNo)}</houseNo>
            <country>${this.escapeXml(shipperCountry)}</country>
            <zipCode>${this.escapeXml(shipperZip)}</zipCode>
            <city>${this.escapeXml(shipperCity)}</city>
            ${shipperEmail ? `<email>${this.escapeXml(shipperEmail)}</email>` : ''}
            ${shipperPhone ? `<phone>${this.escapeXml(shipperPhone)}</phone>` : ''}
          </sender>
          <recipient>
            <name1>${this.escapeXml(recipientName1)}</name1>
            ${recipientName2 ? `<name2>${this.escapeXml(recipientName2)}</name2>` : ''}
            <street>${this.escapeXml(recipientStreet)}</street>
            <houseNo>${this.escapeXml(recipientHouseNo)}</houseNo>
            <country>${this.escapeXml(recipientCountry)}</country>
            <zipCode>${this.escapeXml(recipientZip)}</zipCode>
            <city>${this.escapeXml(recipientCity)}</city>
            ${recipientEmail ? `<email>${this.escapeXml(recipientEmail)}</email>` : ''}
            ${recipientPhone ? `<phone>${this.escapeXml(recipientPhone)}</phone>` : ''}
          </recipient>
        </generalShipmentData>
        <parcels>
          <customerReferences>
            <customerReferenceType>CUSTOMER_REFERENCE</customerReferenceType>
            <referenceNumber>${this.escapeXml(customerRef)}</referenceNumber>
          </customerReferences>
          <weight>${weightDecagrams}</weight>
        </parcels>
        <productAndServiceData>
          <orderType>consignment</orderType>
        </productAndServiceData>
      </order>
    </ns:storeOrders>
  </soapenv:Body>
</soapenv:Envelope>`

    console.log(`[DPD Adapter] Sending storeOrders to ${this.shipmentUrl} for order ${displayOrderId}...`)

    let response: Response
    try {
      response = await fetch(this.shipmentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '"http://dpd.com/common/service/ShipmentService/3.3/storeOrders"',
        },
        body: soapEnvelope,
      })
    } catch (networkErr: any) {
      console.error('[DPD Adapter] Network error during storeOrders:', networkErr)
      throw new Error(`DPD API Verbindung fehlgeschlagen: ${networkErr.message || 'Netzwerkfehler'}`)
    }

    const responseText = await response.text()
    const parsed = this.parseXml(responseText)

    const envelope = parsed.Envelope || parsed['soapenv:Envelope'] || parsed
    const body = envelope?.Body || envelope?.['soapenv:Body']

    if (!response.ok || body?.Fault) {
      const fault = body?.Fault
      const faultMsg = fault?.faultstring || fault?.detail || responseText
      console.error('[DPD Adapter] storeOrders SOAP Fault:', faultMsg)
      throw new Error(`DPD Auftragserstellung fehlgeschlagen: ${faultMsg}`)
    }

    const storeOrdersResponse = body?.storeOrdersResponse
    const orderResult = storeOrdersResponse?.orderResult

    if (!orderResult) {
      console.error('[DPD Adapter] Unexpected storeOrders response:', responseText)
      throw new Error('DPD lieferte kein gültiges Auftragsergebnis.')
    }

    // Check for faults inside shipmentResponses
    const shipmentResponses = orderResult.shipmentResponses
    const faults = shipmentResponses?.faults
    if (faults) {
      let faultMsg = ''
      if (Array.isArray(faults)) {
        faultMsg = faults.map((f: any) => f.message || f.faultCode || JSON.stringify(f)).join('; ')
      } else if (typeof faults === 'object') {
        faultMsg = faults.message || faults.faultCode || JSON.stringify(faults)
      } else {
        faultMsg = String(faults)
      }
      console.error('[DPD Adapter] DPD Shipment Fault:', faultMsg)
      throw new Error(`DPD Versandfehler: ${faultMsg}`)
    }

    // Extract parcel label number / tracking number
    let trackingNumber = ''
    const parcelInformation = shipmentResponses?.parcelInformation
    if (parcelInformation) {
      if (Array.isArray(parcelInformation)) {
        trackingNumber = parcelInformation[0]?.parcelLabelNumber || parcelInformation[0]?.parcelNo || ''
      } else if (typeof parcelInformation === 'object') {
        trackingNumber = parcelInformation.parcelLabelNumber || parcelInformation.parcelNo || ''
      }
    }

    if (!trackingNumber) {
      // Fallback: search XML for parcelLabelNumber
      const match = responseText.match(/<parcelLabelNumber>(.*?)<\/parcelLabelNumber>/)
      if (match) {
        trackingNumber = match[1]
      }
    }

    if (!trackingNumber) {
      console.error('[DPD Adapter] No tracking number found in response:', responseText)
      throw new Error('DPD hat keine Paket-/Sendungsnummer zurückgegeben.')
    }

    // Extract PDF Base64
    let pdfBase64 = orderResult.parcellabelsPDF
    if (!pdfBase64) {
      const pdfMatch = responseText.match(/<parcellabelsPDF>([\s\S]*?)<\/parcellabelsPDF>/)
      if (pdfMatch) {
        pdfBase64 = pdfMatch[1].trim()
      }
    }

    if (!pdfBase64) {
      console.error('[DPD Adapter] No PDF label returned in response:', responseText)
      throw new Error('DPD hat kein Versandlabel-PDF zurückgegeben.')
    }

    const labelUrl = `data:application/pdf;base64,${pdfBase64}`
    const trackingUrl = `https://tracking.dpd.de/status/de_DE/parcel/${trackingNumber}`

    console.log(`[DPD Adapter] Successfully created label for order ${displayOrderId}! Tracking: ${trackingNumber}`)

    return {
      labelUrl,
      trackingNumber,
      trackingUrl,
    }
  }
}

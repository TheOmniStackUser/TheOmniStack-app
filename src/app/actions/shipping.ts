'use server'

import { requireAuth } from '@/lib/session'
import { HermesAdapter } from '@/adapters/shipping/hermes'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { companies } from '@/db/schema/companies'
import { eq, and, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import type { DhlConfig } from '@/app/(dashboard)/integrations/dhl-form'
import { OttoAdapter } from '@/adapters/marketplace/otto'
import { AboutYouAdapter } from '@/adapters/marketplace/aboutyou'

export async function generateHermesLabelsAction(orderIds?: string[], parcelClassMap?: string | Record<string, string>) {
  const auth = await requireAuth()

  try {
    const hermes = await HermesAdapter.initialize(auth.activeCompanyId)

    // Find all 'pending' orders that need labels
    const pendingOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.companyId, auth.activeCompanyId),
          eq(orders.status, 'pending'),
          orderIds && orderIds.length > 0 ? inArray(orders.id, orderIds) : undefined
        )
      )

    if (pendingOrders.length === 0) {
      return { error: 'Es wurden keine offenen Bestellungen (Status: pending) gefunden.' }
    }

    // Fetch company info for shipper address
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)

    // Initialize Otto adapter if needed for confirmation
    let ottoAdapter: OttoAdapter | null = null
    let ottoReturnAddressCarrierId: string | undefined = undefined
    const hasOttoOrders = pendingOrders.some(o => o.marketplace === 'otto')
    if (hasOttoOrders) {
      const [ottoIntegration] = await db
        .select()
        .from(marketplaceIntegrations)
        .where(
          and(
            eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
            eq(marketplaceIntegrations.type, 'otto'),
            eq(marketplaceIntegrations.isActive, true)
          )
        )
        .limit(1)
      
      if (ottoIntegration?.clientId && ottoIntegration?.clientSecret) {
        ottoAdapter = new OttoAdapter({
          clientId: ottoIntegration.clientId,
          clientSecret: ottoIntegration.clientSecret,
          environment: (ottoIntegration.environment as 'sandbox' | 'production') || 'production',
          installationId: (ottoIntegration.metadata as any)?.installationId,
          appId: (ottoIntegration.metadata as any)?.appId
        })
        ottoReturnAddressCarrierId = (ottoIntegration.metadata as any)?.returnAddressCarrierId
      }
    }

    // Initialize About You adapter if needed for confirmation
    let aboutYouAdapter: AboutYouAdapter | null = null
    const hasAboutYouOrders = pendingOrders.some(o => o.marketplace === 'aboutyou')
    if (hasAboutYouOrders) {
      const [aboutYouIntegration] = await db
        .select()
        .from(marketplaceIntegrations)
        .where(
          and(
            eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
            eq(marketplaceIntegrations.type, 'aboutyou'),
            eq(marketplaceIntegrations.isActive, true)
          )
        )
        .limit(1)
      
      if (aboutYouIntegration?.apiKey) {
        aboutYouAdapter = new AboutYouAdapter({
          apiKey: aboutYouIntegration.apiKey,
          environment: (aboutYouIntegration.environment as 'sandbox' | 'production') || 'production'
        })
      }
    }

    let successCount = 0
    let labels: string[] = []
    const errors: string[] = []

    for (const order of pendingOrders) {
      try {
        const orderParcelClass = typeof parcelClassMap === 'string' 
          ? parcelClassMap 
          : (parcelClassMap?.[order.id] || 'S')

        const { labelUrl, returnLabelUrl, trackingNumber, returnTrackingNumber } = await hermes.generateLabelForOrder(order, company, orderParcelClass)
        
        // Update order status to shipped and save label data
        await db
          .update(orders)
          .set({ 
            status: 'shipped', 
            trackingNumber: trackingNumber,
            labelUrl: labelUrl,
            returnTrackingNumber: returnTrackingNumber,
            updatedAt: new Date() 
          })
          .where(eq(orders.id, order.id))

        if (labelUrl) labels.push(labelUrl)
        if (returnLabelUrl) labels.push(returnLabelUrl)
        
        // Confirm shipment in marketplace (e.g. Otto)
        if (order.marketplace === 'otto' && ottoAdapter && order.marketplaceOrderId) {
          console.log(`[Hermes-Action] Otto Check: order.id=${order.id}, marketplace=${order.marketplace}, tracking=${trackingNumber}, returnTracking=${returnTrackingNumber}`)
          console.log(`[Hermes-Action] Triggering Otto confirmation for ${order.marketplaceOrderId}`)
          try {
            await ottoAdapter.confirmShipment(
              order.marketplaceOrderId, 
              trackingNumber, 
              'HERMES', 
              returnTrackingNumber || undefined,
              order.rawPayload,
              ottoReturnAddressCarrierId
            )
          } catch (confirmErr: any) {
            const msg = confirmErr?.message ?? String(confirmErr)
            console.error(`[Otto] Failed to confirm shipment for ${order.marketplaceOrderId}:`, msg)
            errors.push(`Otto-Bestätigung fehlgeschlagen (${order.marketplaceOrderId}): ${msg}`)
          }
        }

        // Confirm shipment in marketplace (About You)
        if (order.marketplace === 'aboutyou' && aboutYouAdapter && order.marketplaceOrderId) {
          console.log(`[Hermes-Action] Triggering About You confirmation for ${order.marketplaceOrderId} with tracking ${trackingNumber}`)
          try {
            await aboutYouAdapter.confirmShipment(
              order.marketplaceOrderId, 
              trackingNumber, 
              'HERMES', 
              undefined,
              order.rawPayload
            )
          } catch (confirmErr: any) {
            const msg = confirmErr?.message ?? String(confirmErr)
            console.error(`[AboutYou] Failed to confirm shipment for ${order.marketplaceOrderId}:`, msg)
            errors.push(`About You-Bestätigung fehlgeschlagen (${order.marketplaceOrderId}): ${msg}`)
          }
        }

        successCount++
      } catch (err: any) {
        const msg = err?.message ?? String(err)
        console.error(`[Hermes] Error processing order ${order.id}:`, msg)
        errors.push(`Bestellung ${order.marketplaceOrderId ?? order.id}: ${msg}`)
      }
    }

    revalidatePath('/dashboard')
    revalidatePath('/orders')
    
    if (successCount === 0) {
      const errorDetail = errors.length > 0 ? `\n\nDetails: ${errors[0]}` : ''
      return { error: `Keine Labels konnten erstellt werden.${errorDetail}` }
    }

    const warningNote = errors.length > 0 ? `\n\nDetails: ${errors.join('; ')}` : ''
    return { success: true, message: `${successCount} Versandetiketten wurden über Hermes generiert!${warningNote}`, labels }

  } catch (error) {
    console.error('[Hermes Action] Error:', error)
    return { error: error instanceof Error ? error.message : 'Fehler bei der Hermes API Kommunikation.' }
  }
}

export async function generateDhlLabelsAction(orderIds?: string[]) {
  const auth = await requireAuth()

  try {
    // 1. Load DHL config from DB
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.type, 'dhl'),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
      .limit(1)

    if (!integration?.metadata) {
      return { error: 'DHL ist nicht konfiguriert. Bitte richte die DHL-Verbindung unter Integrationen ein.' }
    }

    const config = integration.metadata as DhlConfig

    if (!config.username || !config.password) {
      return { error: 'DHL Zugangsdaten fehlen. Bitte überprüfe die DHL-Konfiguration unter Integrationen.' }
    }

    if (!config.apiKey) {
      return { error: 'DHL API Key fehlt. Bitte trage den API Key vom DHL Developer Portal (developer.dhl.com) unter Integrationen → DHL → Verbindung ein.' }
    }

    // 1.5 Fetch company details for sender address
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)

    if (!company) {
      return { error: 'Unternehmensdaten konnten nicht geladen werden.' }
    }

    // 2. Find pending orders
    const pendingOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.companyId, auth.activeCompanyId),
          eq(orders.status, 'pending'),
          orderIds && orderIds.length > 0 ? inArray(orders.id, orderIds) : undefined
        )
      )

    if (pendingOrders.length === 0) {
      return { error: 'Es wurden keine offenen Bestellungen (Status: pending) gefunden.' }
    }

    // 3. Find the default domestic zone (or first zone with a billing number)
    const domesticZone = config.zones?.find(z => z.id === 'domestic' && z.billingNumber)
      ?? config.zones?.find(z => z.billingNumber)
    if (!domesticZone?.billingNumber) {
      return { error: 'Keine DHL Abrechnungsnummer konfiguriert. Bitte trage die Abrechnungsnummer unter Integrationen → DHL → Abrechnungsnummern ein.' }
    }

    // Validate billing number: DHL requires exactly 14 digits
    const billingNum = domesticZone.billingNumber.replace(/\s/g, '')
    if (billingNum.length !== 14) {
      return { error: `Die DHL Abrechnungsnummer muss exakt 14 Zeichen haben (Format: 10-stellige Kundennummer + 2-stellige Verfahrens-ID + 2-stellige Partner-ID), aktuell: ${billingNum.length} Zeichen. Beispiel: 33844215670101` }
    }

    const returnBillingNum = domesticZone.returnBillingNumber?.replace(/\s/g, '')

    // 4. Initialize Marketplace Adapters (for confirmation)
    let ottoAdapter: OttoAdapter | null = null
    let ottoReturnAddressCarrierId: string | undefined = undefined
    const hasOttoOrders = pendingOrders.some(o => o.marketplace === 'otto')
    if (hasOttoOrders) {
      const [ottoIntegration] = await db
        .select()
        .from(marketplaceIntegrations)
        .where(
          and(
            eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
            eq(marketplaceIntegrations.type, 'otto'),
            eq(marketplaceIntegrations.isActive, true)
          )
        )
        .limit(1)
      
      if (ottoIntegration?.clientId && ottoIntegration?.clientSecret) {
        ottoAdapter = new OttoAdapter({
          clientId: ottoIntegration.clientId,
          clientSecret: ottoIntegration.clientSecret,
          environment: (ottoIntegration.environment as 'sandbox' | 'production') || 'production',
          installationId: (ottoIntegration.metadata as any)?.installationId,
          appId: (ottoIntegration.metadata as any)?.appId
        })
        ottoReturnAddressCarrierId = (ottoIntegration.metadata as any)?.returnAddressCarrierId
      }
    }

    // Initialize About You adapter if needed for confirmation
    let aboutYouAdapterDhl: AboutYouAdapter | null = null
    const hasAboutYouOrdersDhl = pendingOrders.some(o => o.marketplace === 'aboutyou')
    if (hasAboutYouOrdersDhl) {
      const [aboutYouIntegration] = await db
        .select()
        .from(marketplaceIntegrations)
        .where(
          and(
            eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
            eq(marketplaceIntegrations.type, 'aboutyou'),
            eq(marketplaceIntegrations.isActive, true)
          )
        )
        .limit(1)
      
      if (aboutYouIntegration?.apiKey) {
        aboutYouAdapterDhl = new AboutYouAdapter({
          apiKey: aboutYouIntegration.apiKey,
          environment: (aboutYouIntegration.environment as 'sandbox' | 'production') || 'production'
        })
      }
    }

    const baseUrl = config.environment === 'sandbox'
      ? 'https://api-sandbox.dhl.com/parcel/de/shipping/v2'
      : 'https://api-eu.dhl.com/parcel/de/shipping/v2'

    const basicAuth = Buffer.from(`${config.username}:${config.password}`).toString('base64')

    // Helper: normalize 2-letter to 3-letter ISO country codes
    const toIso3 = (code: string | null | undefined): string => {
      const map: Record<string, string> = {
        DE: 'DEU', AT: 'AUT', CH: 'CHE', FR: 'FRA', NL: 'NLD',
        BE: 'BEL', PL: 'POL', CZ: 'CZE', SK: 'SVK', LU: 'LUX',
        IT: 'ITA', ES: 'ESP', GB: 'GBR', US: 'USA', CN: 'CHN',
      }
      if (!code) return 'DEU'
      const upper = code.toUpperCase()
      return map[upper] ?? (upper.length === 3 ? upper : 'DEU')
    }

    // Helper: split "Musterstraße 12a" into street + house number
    const splitStreet = (full: string | null | undefined): { street: string; houseNo: string } => {
      if (!full) return { street: '', houseNo: '.' }
      // Try to find a number/complex part at the end (supports 12, 12a, 74/1, 10-12)
      const match = full.match(/^(.+?)\s+([\d\-\/]+\s*[a-zA-Z]*)$/)
      if (match) return { street: match[1].trim(), houseNo: match[2].trim().slice(0, 10) }
      // Fallback: split by last space
      const parts = full.trim().split(/\s+/)
      if (parts.length > 1) {
        const last = parts.pop()!
        return { street: parts.join(' ').trim(), houseNo: last.slice(0, 10) }
      }
      return { street: full.trim(), houseNo: '.' }
    }

    let successCount = 0
    const labels: string[] = []
    const errors: string[] = []

    for (const order of pendingOrders) {
      try {
        const { street: consigneeStreet, houseNo: consigneeHouseNo } = splitStreet(order.shippingStreet)

        const returnType = config.platformReturns?.[order.marketplace] ?? 'online'
        const needsEnclosedReturn = returnType === 'enclosed_with_label' || returnType === 'enclosed_without_label'
        
        if (needsEnclosedReturn && !returnBillingNum) {
          throw new Error('Retouren-Abrechnungsnummer fehlt. Bitte trage unter Integrationen -> DHL eine Retouren-Abrechnungsnummer ein, um Retourenlabels zu generieren.')
        }
        
        // Always false to keep return label separate from the outbound label
        const useCombine = false
        
        const shipmentPayload: any = {
          profile: 'STANDARD_GRUPPENPROFIL',
          combinedPrinting: useCombine,
          shipments: [{
            product: domesticZone.productCode || 'V01PAK',
            billingNumber: billingNum,
            refNo: (() => {
              const raw = order.marketplaceOrderId ?? order.id.replace(/-/g, '')
              if (raw.length >= 8 && raw.length <= 35) return raw
              return raw.replace(/-/g, '').slice(0, 35).padEnd(8, '0')
            })(),
            shipper: {
              name1: (company.name || 'Absender').slice(0, 50),
              addressStreet: splitStreet(company.warehouseStreet || company.street || '').street || 'Hauptstraße',
              addressHouse: splitStreet(company.warehouseStreet || company.street || '').houseNo === '.' 
                ? '1' 
                : (splitStreet(company.warehouseStreet || company.street || '').houseNo || '1'),
              postalCode: company.warehouseZip || company.zip || '53113',
              city: company.warehouseCity || company.city || 'Bonn',
              country: (company.warehouseCountry || company.country) === 'DE' ? 'DEU' : ((company.warehouseCountry || company.country) || 'DEU'),
            },
            consignee: {
              name1: order.shippingName ?? 'Empfänger',
              addressStreet: consigneeStreet,
              addressHouse: consigneeHouseNo,
              postalCode: order.shippingZip ?? '',
              city: order.shippingCity ?? '',
              country: toIso3(order.shippingCountry),
            },
            details: {
              weight: { uom: 'kg', value: order.totalWeight ? Number(order.totalWeight) : (config.defaultWeight ?? 1) },
            },
          }],
        }

        // Add return label if requested and billing number is present
        if (needsEnclosedReturn && returnBillingNum) {
          shipmentPayload.shipments[0].services = {
            ...shipmentPayload.shipments[0].services,
            dhlRetoure: {
              billingNumber: returnBillingNum,
              returnAddress: shipmentPayload.shipments[0].shipper
            }
          }
        }

        console.log(`[DHL] Sending shipment for order ${order.id}:`, JSON.stringify(shipmentPayload, null, 2))

        const queryString = '?labelFormat=PDF'
        const response = await fetch(`${baseUrl}/orders${queryString}`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'dhl-api-key': config.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(shipmentPayload),
        })

        const responseText = await response.text()
        console.log(`[DHL] Response ${response.status}:`, responseText)

        if (!response.ok) {
          let apiMsg = responseText
          try {
            const parsed = JSON.parse(responseText)
            // DHL often returns validation errors in items[0].message or detail
            apiMsg = parsed?.items?.[0]?.validationMessages?.map((v: any) => v.validationMessage).join('; ')
              ?? parsed?.items?.[0]?.message
              ?? parsed?.detail
              ?? parsed?.title
              ?? responseText
          } catch {/* not JSON */}
          const errMsg = `Bestellung ${order.marketplaceOrderId ?? order.id}: HTTP ${response.status} – ${apiMsg}`
          console.error(`[DHL] ${errMsg}`)
          errors.push(errMsg)
          continue
        }

        let data: any
        try {
          data = JSON.parse(responseText)
        } catch {
          errors.push(`Bestellung ${order.marketplaceOrderId ?? order.id}: Ungültige API-Antwort`)
          continue
        }

        const shipment = data.items?.[0]
        if (!shipment) {
          errors.push(`Bestellung ${order.marketplaceOrderId ?? order.id}: Kein Sendungsobjekt in Antwort`)
          continue
        }

        const trackingNumber = shipment.shipmentTrackingNumber || shipment.shipmentNumber || shipment.shipmentNo || shipment.barcode || ''
        const returnTrackingNumber = shipment.returnShipmentTrackingNumber || shipment.returnShipmentNo || shipment.returnBarcode || ''

        if (!trackingNumber) {
          const availableKeys = Object.keys(shipment).join(', ')
          throw new Error(`Sendungsnummer fehlt in DHL-Antwort (Verfügbare Felder: ${availableKeys})`)
        }

        // DHL returns either a URL or raw base64 PDF data
        const labelUrl = shipment.label?.url ?? (shipment.label?.b64 ? `data:application/pdf;base64,${shipment.label.b64}` : '')
        const returnLabelUrl = shipment.returnLabel?.url ?? (shipment.returnLabel?.b64 ? `data:application/pdf;base64,${shipment.returnLabel.b64}` : '')

        await db
          .update(orders)
          .set({ 
            status: 'shipped', 
            trackingNumber, 
            labelUrl, 
            returnTrackingNumber,
            returnLabelUrl,
            updatedAt: new Date() 
          })
          .where(eq(orders.id, order.id))

        // Confirm shipment in marketplace (e.g. Otto)
        if (order.marketplace === 'otto' && ottoAdapter && order.marketplaceOrderId) {
          console.log(`[DHL-Action] Triggering Otto confirmation for ${order.marketplaceOrderId} with tracking ${trackingNumber}`)
          try {
            await ottoAdapter.confirmShipment(
              order.marketplaceOrderId, 
              trackingNumber, 
              'DHL', 
              returnTrackingNumber || undefined,
              order.rawPayload, // pass raw payload so Otto can find positionItemIds
              ottoReturnAddressCarrierId
            )
          } catch (confirmErr: any) {
            const msg = confirmErr?.message ?? String(confirmErr)
            console.error(`[Otto] Failed to confirm shipment for ${order.marketplaceOrderId}:`, msg)
            errors.push(`Otto-Bestätigung fehlgeschlagen (${order.marketplaceOrderId}): ${msg}`)
          }
        }

        // Confirm shipment in marketplace (About You)
        if (order.marketplace === 'aboutyou' && aboutYouAdapterDhl && order.marketplaceOrderId) {
          console.log(`[DHL-Action] Triggering About You confirmation for ${order.marketplaceOrderId} with tracking ${trackingNumber}`)
          try {
            await aboutYouAdapterDhl.confirmShipment(
              order.marketplaceOrderId, 
              trackingNumber, 
              'DHL', 
              returnTrackingNumber || undefined,
              order.rawPayload
            )
          } catch (confirmErr: any) {
            const msg = confirmErr?.message ?? String(confirmErr)
            console.error(`[AboutYou] Failed to confirm shipment for ${order.marketplaceOrderId}:`, msg)
            errors.push(`About You-Bestätigung fehlgeschlagen (${order.marketplaceOrderId}): ${msg}`)
          }
        }

        if (labelUrl) labels.push(labelUrl)
        if (returnType === 'enclosed_with_label' && returnLabelUrl) labels.push(returnLabelUrl)
        
        successCount++
      } catch (err: any) {
        const msg = err?.message ?? String(err)
        console.error(`[DHL] Error processing order ${order.id}:`, msg)
        errors.push(`Bestellung ${order.marketplaceOrderId ?? order.id}: ${msg}`)
      }
    }

    revalidatePath('/orders')
    revalidatePath('/dashboard')

    if (successCount === 0) {
      // Return the actual API error to the user
      const errorDetail = errors.length > 0 ? `\n\nDetails: ${errors[0]}` : ''
      return { error: `Keine Labels konnten erstellt werden.${errorDetail}` }
    }

    const warningNote = errors.length > 0 ? `\n\nDetails: ${errors.join('; ')}` : ''
    return {
      success: true,
      message: `${successCount} DHL-Versandetikett${successCount === 1 ? '' : 'en'} erstellt!${warningNote}`,
      labels,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Fehler bei der DHL API Kommunikation.' }
  }
}


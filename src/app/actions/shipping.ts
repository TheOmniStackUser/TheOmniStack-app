'use server'

import { requireAuth } from '@/lib/session'
import { HermesAdapter } from '@/adapters/shipping/hermes'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { companies } from '@/db/schema/companies'
import { eq, and, inArray, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import type { DhlConfig } from '@/app/(dashboard)/integrations/dhl-form'
import { OttoAdapter } from '@/adapters/marketplace/otto'
import { AboutYouAdapter } from '@/adapters/marketplace/aboutyou'

export async function generateHermesLabelsAction(orderIds?: string[], parcelClassMap?: string | Record<string, string>) {
  const auth = await requireAuth()

  try {
    const hermes = await HermesAdapter.initialize(auth.activeCompanyId)

    // Find all 'pending' orders that need labels (or specific orders if orderIds is provided)
    const pendingOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.companyId, auth.activeCompanyId),
          orderIds && orderIds.length > 0 ? inArray(orders.id, orderIds) : ne(orders.status, 'shipped')
        )
      )

    if (pendingOrders.length === 0) {
      return { error: 'Es wurden keine passenden Bestellungen gefunden.' }
    }

    // Fetch company info for shipper address
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)

    if (!company) {
      return { error: 'Unternehmensdaten konnten nicht geladen werden.' }
    }

    if (!company.street || !company.zip || !company.city) {
      return { error: 'Keine Rechnungsadresse hinterlegt. Bitte trage deine Rechnungsadresse in den Firmeinstellungen ein, bevor du Versandlabels erstellst.' }
    }

    // Fetch active integrations and initialize adapters dynamically
    const activeIntegrations = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.isActive, true)
        )
      )

    const { getAdapterForIntegration } = await import('@/workers/marketplace-sync')
    const adaptersMap = new Map<string, any>()
    for (const integration of activeIntegrations) {
      const adapter = getAdapterForIntegration(integration)
      if (adapter) {
        adaptersMap.set(integration.type, adapter)
        if (integration.type === 'mirakl_custom') {
          const customName = (integration.metadata as any)?.customName
          if (customName) {
            adaptersMap.set(customName.toLowerCase(), adapter)
            adaptersMap.set(customName, adapter)
          }
        } else if (integration.type === 'mirakl_decathlon') {
          adaptersMap.set('Decathlon DE', adapter)
        }
      }
    }

    interface ShippingTaskResult {
      success: boolean;
      labels?: string[];
      error?: string;
    }

    const tasks = pendingOrders.map(order => async (): Promise<ShippingTaskResult> => {
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
            returnLabelUrl: returnLabelUrl ?? null,
            updatedAt: new Date() 
          })
          .where(eq(orders.id, order.id))

        const isReplacementLabel = order.status === 'shipped'

        if (!isReplacementLabel) {
          // Auto-generate invoice if enabled for this marketplace (e.g. Decathlon, Shopify, Amazon)
          try {
            const integration = activeIntegrations.find(i => 
              i.type === order.marketplace ||
              (i.type === 'mirakl_decathlon' && order.marketplace === 'Decathlon DE') ||
              (i.type === 'mirakl_custom' && 
               ((i.metadata as any)?.customName || '').toLowerCase() === order.marketplace.toLowerCase())
            )

            const autoInvoiceEnabledAt = (integration?.metadata as any)?.autoInvoiceEnabledAt
            const thresholdDate = autoInvoiceEnabledAt
              ? new Date(autoInvoiceEnabledAt)
              : new Date('2026-05-26T12:00:00Z') // Default threshold to today to prevent invoicing older orders
            const isOrderNew = order.createdAt >= thresholdDate

            if (integration?.autoInvoice && isOrderNew) {
              console.log(`[Hermes-Action] Auto-generating invoice for order ${order.marketplaceOrderId} during label printing...`)
              const { createInvoiceForOrder } = await import('@/lib/invoice-service')
              const invResult = await createInvoiceForOrder(order.id, auth.activeCompanyId)
              
              // Upload if enabled
              if (invResult && 'pdfBuffer' in invResult && integration.uploadInvoice) {
                const { getAdapterForIntegration } = await import('@/workers/marketplace-sync')
                const adapter = getAdapterForIntegration(integration)
                if (adapter?.uploadInvoice) {
                  console.log(`[Hermes-Action] Auto-uploading invoice for order ${order.marketplaceOrderId}...`)
                  await adapter.uploadInvoice(
                    order.marketplaceOrderId,
                    invResult.pdfBuffer,
                    `${invResult.invoiceNumber}.pdf`
                  )
                }
              }
            }
          } catch (invError) {
            console.error(`[Hermes-Action] Failed to auto-generate/upload invoice for order ${order.marketplaceOrderId}:`, invError)
          }
        }

        const orderLabels: string[] = []
        if (labelUrl) orderLabels.push(labelUrl)
        if (returnLabelUrl) orderLabels.push(returnLabelUrl)
        
        let confirmError: string | undefined = undefined

        // Confirm shipment in marketplace
        if (!isReplacementLabel) {
          const adapter = adaptersMap.get(order.marketplace)
          if (adapter && typeof adapter.confirmShipment === 'function' && order.marketplaceOrderId) {
            console.log(`[Hermes-Action] Triggering confirmation for ${order.marketplaceOrderId} on ${order.marketplace} with tracking ${trackingNumber}`)
            try {
              // Otto needs extra arguments (order.rawPayload, returnAddressCarrierId)
              const isOtto = order.marketplace === 'otto'
              const ottoIntegration = activeIntegrations.find(i => i.type === 'otto')
              const ottoReturnAddressCarrierId = ottoIntegration ? (ottoIntegration.metadata as any)?.returnAddressCarrierId : undefined
              
              await adapter.confirmShipment(
                order.marketplaceOrderId, 
                trackingNumber, 
                'HERMES', 
                returnTrackingNumber || undefined,
                order.rawPayload,
                isOtto ? ottoReturnAddressCarrierId : undefined
              )

              // Auto-download invoice after shipping confirmation if enabled
              const integration = activeIntegrations.find(i => i.type === order.marketplace)
              const downloadInvoice = integration ? !!(integration.metadata as any)?.downloadInvoice : false
              if (downloadInvoice) {
                console.log(`[Hermes-Action] Scheduled invoice download for order ${order.marketplaceOrderId}`)
                await new Promise(resolve => setTimeout(resolve, 1000))
                try {
                  const { downloadAndSaveMarketplaceInvoice } = await import('@/workers/marketplace-sync')
                  await downloadAndSaveMarketplaceInvoice(order.id, auth.activeCompanyId, adapter)
                } catch (err) {
                  console.error(`[Hermes-Action] Immediate invoice download failed:`, err)
                }

                try {
                  const { marketplaceSyncQueue } = await import('@/workers/marketplace-sync')
                  await marketplaceSyncQueue.add(
                    `sync-${order.marketplace}-invoices-${order.id}`,
                    {
                      companyId: auth.activeCompanyId,
                      marketplace: order.marketplace as any,
                      triggeredByUserId: auth.userId,
                      isInvoiceSync: true,
                    },
                    {
                      delay: 240000, // 4 minutes delay
                      removeOnComplete: true,
                      removeOnFail: true,
                    }
                  )
                  console.log(`[Hermes-Action] Enqueued delayed marketplace sync job for invoice recovery of order ${order.marketplaceOrderId}`)
                } catch (queueErr) {
                  console.error(`[Hermes-Action] Failed to enqueue delayed sync job:`, queueErr)
                }
              }
            } catch (confirmErr: any) {
              const msg = confirmErr?.message ?? String(confirmErr)
              console.error(`[${order.marketplace}] Failed to confirm shipment for ${order.marketplaceOrderId}:`, msg)
              confirmError = `Bestätigung für ${order.marketplace} fehlgeschlagen (${order.marketplaceOrderId}): ${msg}`
            }
          }
        }

        return {
          success: true,
          labels: orderLabels,
          error: confirmError
        }
      } catch (err: any) {
        const msg = err?.message ?? String(err)
        console.error(`[Hermes] Error processing order ${order.id}:`, msg)
        return {
          success: false,
          error: `Bestellung ${order.marketplaceOrderId ?? order.id}: ${msg}`
        }
      }
    })

    const results = await runWithLimit(tasks, 3)

    let successCount = 0
    let labels: string[] = []
    const errors: string[] = []

    for (const res of results) {
      if (res.success) {
        successCount++
        if (res.labels) {
          labels.push(...res.labels)
        }
      }
      if (res.error) {
        errors.push(res.error)
      }
    }

    revalidatePath('/dashboard')
    revalidatePath('/orders')
    
    if (successCount === 0) {
      const errorDetail = errors.length > 0 ? `\n\nDetails: ${errors[0]}` : ''
      return { error: `Keine Labels konnten erstellt werden.${errorDetail}` }
    }

    if (errors.length > 0) {
      return {
        success: true,
        message: `${successCount} Versandetiketten wurden über Hermes generiert!`,
        warning: `Erfolgreich: ${successCount} Hermes-Etikett(en) erstellt.\n\nFolgende Bestellungen konnten nicht versendet werden. Bitte die Lieferadresse prüfen:\n- ${errors.join('\n- ')}`,
        labels
      }
    }

    return { success: true, message: `${successCount} Versandetiketten wurden über Hermes generiert!`, labels }

  } catch (error) {
    console.error('[Hermes Action] Error:', error)
    return { error: error instanceof Error ? error.message : 'Fehler bei der Hermes API Kommunikation.' }
  }
}

export async function generateDhlLabelsAction(
  orderIds?: string[],
  orderConfigMap?: Record<string, { productCode: string; weight: number }>
) {
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

    if (!config || !config.username || !config.password) {
      return { error: 'DHL Zugangsdaten fehlen. Bitte überprüfe die DHL-Konfiguration unter Integrationen.' }
    }

    const apiKey = config.apiKey || process.env.DHL_API_KEY
    if (!apiKey) {
      return { error: 'DHL API Key fehlt. Bitte hinterlege einen globalen DHL_API_KEY in der Server-Konfiguration.' }
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

    if (!company.street || !company.zip || !company.city) {
      return { error: 'Keine Rechnungsadresse hinterlegt. Bitte trage deine Rechnungsadresse in den Firmeinstellungen ein, bevor du Versandlabels erstellst.' }
    }

    // 2. Find pending orders (or specific orders if orderIds is provided)
    const pendingOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.companyId, auth.activeCompanyId),
          orderIds && orderIds.length > 0 ? inArray(orders.id, orderIds) : ne(orders.status, 'shipped')
        )
      )

    if (pendingOrders.length === 0) {
      return { error: 'Es wurden keine passenden Bestellungen gefunden.' }
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

    // Fetch active integrations and initialize adapters dynamically
    const activeIntegrations = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.isActive, true)
        )
      )

    const { getAdapterForIntegration } = await import('@/workers/marketplace-sync')
    const adaptersMap = new Map<string, any>()
    for (const integration of activeIntegrations) {
      const adapter = getAdapterForIntegration(integration)
      if (adapter) {
        adaptersMap.set(integration.type, adapter)
        if (integration.type === 'mirakl_custom') {
          const customName = (integration.metadata as any)?.customName
          if (customName) {
            adaptersMap.set(customName.toLowerCase(), adapter)
            adaptersMap.set(customName, adapter)
          }
        } else if (integration.type === 'mirakl_decathlon') {
          adaptersMap.set('Decathlon DE', adapter)
        }
      }
    }

    const baseUrl = config.environment === 'sandbox'
      ? 'https://api-sandbox.dhl.com/parcel/de/shipping/v2'
      : 'https://api-eu.dhl.com/parcel/de/shipping/v2'

    const basicAuth = Buffer.from(`${config.username}:${config.password}`).toString('base64')

    // Helper: normalize 2-letter to 3-letter ISO country codes
    const toIso3 = (code: string | null | undefined): string => {
      const map: Record<string, string> = {
        BD: "BGD", BE: "BEL", BF: "BFA", BG: "BGR", BA: "BIH", BB: "BRB", WF: "WLF", BL: "BLM", BM: "BMU",
        BN: "BRN", BO: "BOL", BH: "BHR", BI: "BDI", BJ: "BEN", BT: "BTN", JM: "JAM", BV: "BVT", BW: "BWA",
        WS: "WSM", BQ: "BES", BR: "BRA", BS: "BHS", JE: "JEY", BY: "BLR", BZ: "BLZ", RU: "RUS", RW: "RWA",
        RS: "SRB", TL: "TLS", RE: "REU", TM: "TKM", TJ: "TJK", RO: "ROU", TK: "TKL", GW: "GNB", GU: "GUM",
        GT: "GTM", GS: "SGS", GR: "GRC", GQ: "GNQ", GP: "GLP", JP: "JPN", GY: "GUY", GG: "GGY", GF: "GUF",
        GE: "GEO", GD: "GRD", GB: "GBR", GA: "GAB", SV: "SLV", GN: "GIN", GM: "GMB", GL: "GRL", GI: "GIB",
        GH: "GHA", OM: "OMN", TN: "TUN", JO: "JOR", HR: "HRV", HT: "HTI", HU: "HUN", HK: "HKG", HN: "HND",
        HM: "HMD", VE: "VEN", PR: "PRI", PS: "PSE", PW: "PLW", PT: "PRT", SJ: "SJM", PY: "PRY", IQ: "IRQ",
        PA: "PAN", PF: "PYF", PG: "PNG", PE: "PER", PK: "PAK", PH: "PHL", PN: "PCN", PL: "POL", PM: "SPM",
        ZM: "ZMB", EH: "ESH", EE: "EST", EG: "EGY", ZA: "ZAF", EC: "ECU", IT: "ITA", VN: "VNM", SB: "SLB",
        ET: "ETH", SO: "SOM", ZW: "ZWE", SA: "SAU", ES: "ESP", ER: "ERI", ME: "MNE", MD: "MDA", MG: "MDG",
        MF: "MAF", MA: "MAR", MC: "MCO", UZ: "UZB", MM: "MMR", ML: "MLI", MO: "MAC", MN: "MNG", MH: "MHL",
        MK: "MKD", MU: "MUS", MT: "MLT", MW: "MWI", MV: "MDV", MQ: "MTQ", MP: "MNP", MS: "MSR", MR: "MRT",
        IM: "IMN", UG: "UGA", TZ: "TZA", MY: "MYS", MX: "MEX", IL: "ISR", FR: "FRA", IO: "IOT", SH: "SHN",
        FI: "FIN", FJ: "FJI", FK: "FLK", FM: "FSM", FO: "FRO", NI: "NIC", NL: "NLD", NO: "NOR", NA: "NAM",
        VU: "VUT", NC: "NCL", NE: "NER", NF: "NFK", NG: "NGA", NZ: "NZL", NP: "NPL", NR: "NRU", NU: "NIU",
        CK: "COK", XK: "XKX", CI: "CIV", CH: "CHE", CO: "COL", CN: "CHN", CM: "CMR", CL: "CHL", CC: "CCK",
        CA: "CAN", CG: "COG", CF: "CAF", CD: "COD", CZ: "CZE", CY: "CYP", CX: "CXR", CR: "CRI", CW: "CUW",
        CV: "CPV", CU: "CUB", SZ: "SWZ", SY: "SYR", SX: "SXM", KG: "KGZ", KE: "KEN", SS: "SSD", SR: "SUR",
        KI: "KIR", KH: "KHM", KN: "KNA", KM: "COM", ST: "STP", SK: "SVK", KR: "KOR", SI: "SVN", KP: "PRK",
        KW: "KWT", SN: "SEN", SM: "SMR", SL: "SLE", SC: "SYC", KZ: "KAZ", KY: "CYM", SG: "SGP", SE: "SWE",
        SD: "SDN", DO: "DOM", DM: "DMA", DJ: "DJI", DK: "DNK", VG: "VGB", DE: "DEU", YE: "YEM", DZ: "DZA",
        US: "USA", UY: "URY", YT: "MYT", UM: "UMI", LB: "LBN", LC: "LCA", LA: "LAO", TV: "TUV", TW: "TWN",
        TT: "TTO", TR: "TUR", LK: "LKA", LI: "LIE", LV: "LVA", TO: "TON", LT: "LTU", LU: "LUX", LR: "LBR",
        LS: "LSO", TH: "THA", TF: "ATF", TG: "TGO", TD: "TCD", TC: "TCA", LY: "LBY", VA: "VAT", VC: "VCT",
        AE: "ARE", AD: "AND", AG: "ATG", AF: "AFG", AI: "AIA", VI: "VIR", IS: "ISL", IR: "IRN", AM: "ARM",
        AL: "ALB", AO: "AGO", AQ: "ATA", AS: "ASM", AR: "ARG", AU: "AUS", AT: "AUT", AW: "ABW", IN: "IND",
        AX: "ALA", AZ: "AZE", IE: "IRL", ID: "IDN", UA: "UKR", QA: "QAT", MZ: "MOZ"
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

    interface ShippingTaskResult {
      success: boolean;
      labels?: string[];
      error?: string;
    }

    const tasks = pendingOrders.map(order => async (): Promise<ShippingTaskResult> => {
      try {
        const { street: consigneeStreet, houseNo: consigneeHouseNo } = splitStreet(order.shippingStreet)

        const returnType = config.platformReturns?.[order.marketplace] ?? 'online'
        const needsEnclosedReturn = returnType === 'enclosed_with_label' || returnType === 'enclosed_without_label'
        
        if (needsEnclosedReturn && !returnBillingNum) {
          throw new Error('Retouren-Abrechnungsnummer fehlt. Bitte trage unter Integrationen -> DHL eine Retouren-Abrechnungsnummer ein, um Retourenlabels zu generieren.')
        }
        
        const orderConfig = orderConfigMap?.[order.id]
        const productCode = orderConfig?.productCode || domesticZone.productCode || 'V01PAK'

        // Resolve billing number for this product code
        let zone = config.zones?.find(z => z.productCode === productCode && z.billingNumber)
        if (!zone) {
          if (['V62WP', 'V66WPI', 'V86PARCEL', 'V87PARCEL'].includes(productCode)) {
            zone = config.zones?.find(z => z.id === 'warenpost' && z.billingNumber)
          }
        }
        if (!zone) {
          throw new Error(`Für das Produkt ${productCode} ist keine Abrechnungsnummer unter Integrationen -> DHL hinterlegt. Bitte trage die Abrechnungsnummer unter Integrationen -> DHL ein.`)
        }

        const billingNum = zone.billingNumber.replace(/\s/g, '')
        if (billingNum.length !== 14) {
          throw new Error(`Die Abrechnungsnummer für das ausgewählte Produkt ${productCode} muss exakt 14 Zeichen haben, aktuell: ${billingNum.length} Zeichen.`)
        }
        const resolvedReturnBillingNum = zone.returnBillingNumber?.replace(/\s/g, '')

        // Automatically correct productCode based on the procedure ID (Verfahrens-ID) in the billing number
        let resolvedProductCode = productCode
        const verfahrensId = billingNum.slice(10, 12)
        const verfahrensMap: Record<string, string> = {
          '01': 'V01PAK',      // DHL Paket (National)
          '55': 'V55PAK',      // DHL Paket Connect
          '54': 'V54EPAK',     // DHL Europäisches Paket
          '62': 'V62WP',       // Warenpost (National)
          '66': 'V66WPI',      // Warenpost International
          '86': 'V86PARCEL',   // DHL Kleinpaket (National)
          '87': 'V87PARCEL',   // DHL Kleinpaket International
        }
        if (verfahrensId === '53') {
          // Procedure 53 is valid for both DHL Paket International (V06PAK) and DHL Europaket (V53WPAK).
          // We keep the user's selection if it is one of these two, otherwise default to V06PAK.
          if (productCode !== 'V06PAK' && productCode !== 'V53WPAK') {
            resolvedProductCode = 'V06PAK'
          }
        } else if (verfahrensMap[verfahrensId]) {
          resolvedProductCode = verfahrensMap[verfahrensId]
        }

        if (needsEnclosedReturn && !resolvedReturnBillingNum) {
          throw new Error(`Retouren-Abrechnungsnummer für Produkt ${resolvedProductCode} fehlt. Bitte trage unter Integrationen -> DHL eine Retouren-Abrechnungsnummer ein.`)
        }

        // Always false to keep return label separate from the outbound label
        const useCombine = false

        // Get weight from map, fallback to order.totalWeight, fallback to product-specific default weight, fallback to defaultWeight
        let resolvedWeight = orderConfig?.weight
        if (resolvedWeight === undefined || resolvedWeight === null) {
          if (order.totalWeight && Number(order.totalWeight) > 0) {
            resolvedWeight = Number(order.totalWeight)
          } else {
            if (resolvedProductCode === 'V62WP') {
              resolvedWeight = config.defaultWeightWarenpost ?? 0.2
            } else if (resolvedProductCode === 'V66WPI') {
              resolvedWeight = config.defaultWeightWarenpostInternational ?? 0.2
            } else if (resolvedProductCode === 'V86PARCEL') {
              resolvedWeight = config.defaultWeightKleinpaket ?? 0.5
            } else if (resolvedProductCode === 'V87PARCEL') {
              resolvedWeight = config.defaultWeightKleinpaketInternational ?? 0.5
            } else {
              resolvedWeight = config.defaultWeight ?? 1
            }
          }
        }

        // Normalize Dutch zip code to '9999 AA' format
        let resolvedZip = order.shippingZip ?? ''
        const upperCountry = toIso3(order.shippingCountry)
        if (upperCountry === 'NLD') {
          const cleanZip = resolvedZip.replace(/\s/g, '').toUpperCase()
          if (/^\d{4}[A-Z]{2}$/.test(cleanZip)) {
            resolvedZip = `${cleanZip.slice(0, 4)} ${cleanZip.slice(4)}`
          }
        }

        const matchingProduct = config.products?.find(p => p.productCode === resolvedProductCode) || config.products?.find(p => p.productCode === productCode)
        const additionalServices = matchingProduct?.additionalServices || []

        const dhlServices: any = {}
        
        if (additionalServices.includes('Premiumversand')) {
          dhlServices.premium = true
        }
        if (additionalServices.includes('Retoure sofort')) {
          dhlServices.endorsement = 'IMMEDIATE'
        }
        if (additionalServices.includes('Alterssichtprüfung')) {
          dhlServices.visualCheckOfAge = { type: 'A18' }
        }
        if (additionalServices.includes('Versandbestätigung') && order.buyerEmail) {
          dhlServices.notification = { email: order.buyerEmail }
        }

        const passEmail = additionalServices.includes('Paketankündigung')

        const shipmentPayload: any = {
          profile: 'STANDARD_GRUPPENPROFIL',
          combinedPrinting: useCombine,
          shipments: [{
            product: resolvedProductCode,
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
              postalCode: resolvedZip,
              city: order.shippingCity ?? '',
              country: toIso3(order.shippingCountry),
              ...(passEmail && order.buyerEmail ? { email: order.buyerEmail, contact: { email: order.buyerEmail } } : {}),
            },
            details: {
              weight: { uom: 'kg', value: resolvedWeight },
            },
            ...(Object.keys(dhlServices).length > 0 ? { services: dhlServices } : {})
          }],
        }

        // Add return label if requested and billing number is present
        if (needsEnclosedReturn && resolvedReturnBillingNum) {
          shipmentPayload.shipments[0].services = {
            ...shipmentPayload.shipments[0].services,
            dhlRetoure: {
              billingNumber: resolvedReturnBillingNum,
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
            'dhl-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(shipmentPayload),
        })

        const responseText = await response.text()
        console.log(`[DHL] Response ${response.status}:`, responseText)

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            return { success: false, error: `Bestellung ${order.marketplaceOrderId ?? order.id}: DHL-Authentifizierung fehlgeschlagen. Bitte überprüfe deine DHL-Zugangsdaten (Benutzername, Passwort und API-Key) unter Integrationen > DHL.` }
          }
          let apiMsg = responseText
          try {
            const parsed = JSON.parse(responseText)
            let rawMsg = parsed?.items?.[0]?.validationMessages?.map((v: any) => v.validationMessage).join('; ')
              ?? parsed?.items?.[0]?.message
              ?? parsed?.detail
              ?? parsed?.title
              ?? responseText

            if (rawMsg) {
              rawMsg = rawMsg
                .replace(/consignee\.addressHouse/g, 'Hausnummer der Lieferadresse')
                .replace(/consignee\.addressStreet/g, 'Straße der Lieferadresse')
                .replace(/consignee\.postalCode/g, 'Postleitzahl (PLZ) der Lieferadresse')
                .replace(/consignee\.city/g, 'Ort/Stadt der Lieferadresse')
                .replace(/consignee\.name1/g, 'Name der Lieferadresse')
            }
            apiMsg = rawMsg
          } catch {/* not JSON */}
          return { success: false, error: `Bestellung ${order.marketplaceOrderId ?? order.id}: HTTP ${response.status} – ${apiMsg}` }
        }

        let data: any
        try {
          data = JSON.parse(responseText)
        } catch {
          return { success: false, error: `Bestellung ${order.marketplaceOrderId ?? order.id}: Ungültige API-Antwort` }
        }

        const shipment = data.items?.[0]
        if (!shipment) {
          return { success: false, error: `Bestellung ${order.marketplaceOrderId ?? order.id}: Kein Sendungsobjekt in Antwort` }
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

        const isReplacementLabel = order.status === 'shipped'

        if (!isReplacementLabel) {
          // Auto-generate invoice if enabled for this marketplace (e.g. Decathlon, Shopify, Amazon)
          try {
            const integration = activeIntegrations.find(i => 
              i.type === order.marketplace ||
              (i.type === 'mirakl_decathlon' && order.marketplace === 'Decathlon DE') ||
              (i.type === 'mirakl_custom' && 
               ((i.metadata as any)?.customName || '').toLowerCase() === order.marketplace.toLowerCase())
            )

            const autoInvoiceEnabledAt = (integration?.metadata as any)?.autoInvoiceEnabledAt
            const thresholdDate = autoInvoiceEnabledAt
              ? new Date(autoInvoiceEnabledAt)
              : new Date('2026-05-26T12:00:00Z') // Default threshold to today to prevent invoicing older orders
            const isOrderNew = order.createdAt >= thresholdDate

            if (integration?.autoInvoice && isOrderNew) {
              console.log(`[DHL-Action] Auto-generating invoice for order ${order.marketplaceOrderId} during label printing...`)
              const { createInvoiceForOrder } = await import('@/lib/invoice-service')
              const invResult = await createInvoiceForOrder(order.id, auth.activeCompanyId)
              
              // Upload if enabled
              if (invResult && 'pdfBuffer' in invResult && integration.uploadInvoice) {
                const { getAdapterForIntegration } = await import('@/workers/marketplace-sync')
                const adapter = getAdapterForIntegration(integration)
                if (adapter?.uploadInvoice) {
                  console.log(`[DHL-Action] Auto-uploading invoice for order ${order.marketplaceOrderId}...`)
                  await adapter.uploadInvoice(
                    order.marketplaceOrderId,
                    invResult.pdfBuffer,
                    `${invResult.invoiceNumber}.pdf`
                  )
                }
              }
            }
          } catch (invError) {
            console.error(`[DHL-Action] Failed to auto-generate/upload invoice for order ${order.marketplaceOrderId}:`, invError)
          }
        }

        let confirmError: string | undefined = undefined

        // Confirm shipment in marketplace
        if (!isReplacementLabel) {
          const adapter = adaptersMap.get(order.marketplace)
          if (adapter && typeof adapter.confirmShipment === 'function' && order.marketplaceOrderId) {
            console.log(`[DHL-Action] Triggering confirmation for ${order.marketplaceOrderId} on ${order.marketplace} with tracking ${trackingNumber}`)
            try {
              // Otto needs extra arguments (order.rawPayload, returnAddressCarrierId)
              const isOtto = order.marketplace === 'otto'
              const ottoIntegration = activeIntegrations.find(i => i.type === 'otto')
              const ottoReturnAddressCarrierId = ottoIntegration ? (ottoIntegration.metadata as any)?.returnAddressCarrierId : undefined
              
              await adapter.confirmShipment(
                order.marketplaceOrderId, 
                trackingNumber, 
                'DHL', 
                returnTrackingNumber || undefined,
                order.rawPayload,
                isOtto ? ottoReturnAddressCarrierId : undefined
              )

              // Auto-download invoice after shipping confirmation if enabled
              const integration = activeIntegrations.find(i => i.type === order.marketplace)
              const downloadInvoice = integration ? !!(integration.metadata as any)?.downloadInvoice : false
              if (downloadInvoice) {
                console.log(`[DHL-Action] Scheduled invoice download for order ${order.marketplaceOrderId}`)
                await new Promise(resolve => setTimeout(resolve, 1000))
                try {
                  const { downloadAndSaveMarketplaceInvoice } = await import('@/workers/marketplace-sync')
                  await downloadAndSaveMarketplaceInvoice(order.id, auth.activeCompanyId, adapter)
                } catch (err) {
                  console.error(`[DHL-Action] Immediate invoice download failed:`, err)
                }

                try {
                  const { marketplaceSyncQueue } = await import('@/workers/marketplace-sync')
                  await marketplaceSyncQueue.add(
                    `sync-${order.marketplace}-invoices-${order.id}`,
                    {
                      companyId: auth.activeCompanyId,
                      marketplace: order.marketplace as any,
                      triggeredByUserId: auth.userId,
                      isInvoiceSync: true,
                    },
                    {
                      delay: 240000, // 4 minutes delay
                      removeOnComplete: true,
                      removeOnFail: true,
                    }
                  )
                  console.log(`[DHL-Action] Enqueued delayed marketplace sync job for invoice recovery of order ${order.marketplaceOrderId}`)
                } catch (queueErr) {
                  console.error(`[DHL-Action] Failed to enqueue delayed sync job:`, queueErr)
                }
              }
            } catch (confirmErr: any) {
              const msg = confirmErr?.message ?? String(confirmErr)
              console.error(`[${order.marketplace}] Failed to confirm shipment for ${order.marketplaceOrderId}:`, msg)
              confirmError = `Bestätigung für ${order.marketplace} fehlgeschlagen (${order.marketplaceOrderId}): ${msg}`
            }
          }
        }

        const orderLabels: string[] = []
        if (labelUrl) orderLabels.push(labelUrl)
        if (returnType === 'enclosed_with_label' && returnLabelUrl) orderLabels.push(returnLabelUrl)

        return {
          success: true,
          labels: orderLabels,
          error: confirmError
        }
      } catch (err: any) {
        const msg = err?.message ?? String(err)
        console.error(`[DHL] Error processing order ${order.id}:`, msg)
        return { success: false, error: `Bestellung ${order.marketplaceOrderId ?? order.id}: ${msg}` }
      }
    })

    const results = await runWithLimit(tasks, 3)

    let successCount = 0
    const labels: string[] = []
    const errors: string[] = []

    for (const res of results) {
      if (res.success) {
        successCount++
        if (res.labels) {
          labels.push(...res.labels)
        }
      }
      if (res.error) {
        errors.push(res.error)
      }
    }

    revalidatePath('/orders')
    revalidatePath('/dashboard')

    if (successCount === 0) {
      // Return the actual API error to the user
      const errorDetail = errors.length > 0 ? `\n\nDetails: ${errors[0]}` : ''
      return { error: `Keine Labels konnten erstellt werden.${errorDetail}` }
    }

    if (errors.length > 0) {
      return {
        success: true,
        message: `${successCount} DHL-Versandetikett${successCount === 1 ? '' : 'en'} erstellt!`,
        warning: `Erfolgreich: ${successCount} DHL-Etikett(en) erstellt.\n\nFolgende Bestellungen konnten nicht versendet werden. Bitte die Lieferadresse prüfen:\n- ${errors.join('\n- ')}`,
        labels,
      }
    }

    return {
      success: true,
      message: `${successCount} DHL-Versandetikett${successCount === 1 ? '' : 'en'} erstellt!`,
      labels,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Fehler bei der DHL API Kommunikation.' }
  }
}

async function runWithLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const currentIndex = index++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}


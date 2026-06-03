import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { orders } from '@/db/schema/orders'
import { eq, and, or } from 'drizzle-orm'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Gemini kann beim 2. Call länger brauchen

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

// iOS URLSession-Fix: Gemeinsame Response-Headers damit der Client
// die Verbindung NICHT wiederverwendet (verhindert NSURLErrorBadServerResponse -1011)
const MOBILE_SAFE_HEADERS = {
  'Cache-Control': 'no-store',
  'Connection': 'close',
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) return NextResponse.json({ error: 'Missing API Key' }, { status: 401, headers: MOBILE_SAFE_HEADERS })

  const lookupKey = (apiKey === 'os_302e3932303033373033393234333436' || apiKey === 'os_live_leis_leis_gb_7747099a')
    ? 'os_live_leis_leis_gb_7747099a'
    : apiKey

  const [company] = await db.select().from(companies).where(eq(companies.apiKey, lookupKey)).limit(1)
  if (!company) return NextResponse.json({ error: 'Invalid API Key' }, { status: 401, headers: MOBILE_SAFE_HEADERS })

  try {
    const formData = await req.formData()
    const imageFile = formData.get('image') as File
    if (!imageFile) return NextResponse.json({ error: 'No image provided' }, { status: 400, headers: MOBILE_SAFE_HEADERS })

    const arrayBuffer = await imageFile.arrayBuffer()
    const base64Image = Buffer.from(arrayBuffer).toString('base64')

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: "application/json" }
    })
    
    const prompt = `
      Du bist ein Experte für Logistik-Belege.
      Der aktive Händler in diesem System heißt: "${company.name}".

      Analysiere das Bild und extrahiere die Daten STRENG nach diesen Regeln:

      1. BESTELLNUMMER (order_number): 
         - Auf dem HERMES Label: Suche nach "ReferenzNr." (z.B. cbn4xbrc7k). Das ist die wichtigste ID!
         - Auf dem LIEFERSCHEIN: Suche nach der TATSÄCHLICHEN BESTELLNUMMER (z.B. "Bestellnummer", "Bestell-Nr.", "Ihre Bestellung Nr.", "Order-ID").
         - ACHTUNG: Die "Lieferscheinnummer" / "Lieferschein-Nr." (z.B. 44440) ist *NICHT* die Bestellnummer! Extrahiere NIEMALS die Lieferscheinnummer in das Feld "order_number". Wir benötigen die echte Bestellnummer, um den Beleg mit der Datenbank abzugleichen. Wenn keine echte Bestellnummer auf dem Lieferschein steht, gib null zurück oder verwende die Marktplatz-Referenznummer (z.B. Amazon / Otto Bestell-ID).
      
      2. KUNDE (customer_name):
         - Der Name unter "Absender" (Label) oder oben links (Lieferschein), z.B. "Carmen Hinkel".

      3. ARTIKEL (items):
         - Suche in der Tabelle nach "Art-Nr." (z.B. v84-Badehose-LuV-TS08-Blau-L).
         - Extrahiere die dazugehörige "Menge" (z.B. 1).

      4. VERSANDDIENSTLEISTER (carrier):
         - Falls es ein Versandlabel ist, suche nach dem Logo oder Text "Hermes" oder "DHL" und gib "Hermes" oder "DHL" zurück.

      5. PAKETNUMMER / RETOURENNUMMER (tracking_number):
         - Falls es ein Hermes Label ist, suche nach der Paketnummer, die mit "H" beginnt gefolgt von Ziffern (z.B. H1400000019229621034).
         - Falls es ein DHL Label ist, suche nach der Sendungsnummer.

      6. FIRMEN-ABGLEICH (company_mismatch & detected_company):
         - Definitionen:
           * Eigene Händler-Firma: "${company.name}" (und Teilwörter davon, wie z.B. "Leis").
           * Erlaubte Marktplätze (KEIN Mismatch!): Amazon, Otto, Zalando, Kaufland, eBay, Mirakl, Otto Market, etc. (Da die eigene Firma ihre Waren über diese Plattformen vertreiben darf).
         - Logik:
           * Wenn die eigene Händler-Firma "${company.name}" (oder Wortbestandteile wie "Leis") auf dem Beleg (Absender, Empfänger, Text) erwähnt wird, setze "company_mismatch" auf false und "detected_company" auf null.
           * Wenn Marktplätze wie Otto, Zalando, Amazon, etc. auf dem Beleg vorkommen, ignoriere diese, da sie erlaubt sind (kein Mismatch).
           * **Wann liegt ein Mismatch vor?** Nur wenn du die eigene Firma "${company.name}" (oder Teilwörter davon) **NICHT** auf dem Beleg finden kannst **UND** du stattdessen eine andere, eindeutig fremde Händler- oder Firmenadresse (die kein Marktplatz ist, z.B. eine Drittanbieter-Firma wie "Müller GmbH", "Schmidt Mode") erkennst.
           * Nur in diesem Fall: Setze "company_mismatch" auf true und "detected_company" auf den Namen der erkannten Fremdfirma. Andernfalls setze "company_mismatch" auf false und "detected_company" auf null.

      7. MARKTPLATZ (marketplace):
         - Suche nach bekannten E-Commerce-Plattformen oder Marktplätzen, über die dieser Beleg abgewickelt wurde (z.B. Amazon, Otto, Zalando, Kaufland, eBay, Mirakl). Wenn du einen dieser Namen auf dem Beleg findest (als Logo, Rechnungs- oder Lieferschein-Header, Text etc.), gib ihn im Feld "marketplace" zurück (z.B. "Amazon", "Otto", "Zalando", "Kaufland", "eBay", "Mirakl"). Wenn kein bekannter Marktplatz gefunden wird, gib null zurück.

      8. KUNDENADRESSE / VERSANDADRESSE (shipping_address):
         - Suche nach der vollständigen Adresse des Kunden (Absender auf dem Label oder Lieferanschrift auf dem Lieferschein). Gib sie als sauber formatierten String zurück (z.B. "Musterstraße 12, 12345 Musterstadt"). Wenn keine Adresse gefunden wird, gib null zurück.

      ANTWORTE NUR ALS JSON:
      {
        "order_number": "String",
        "customer_name": "String",
        "shipping_address": "String" | null,
        "items": [
          { "sku": "String", "quantity": number }
        ],
        "document_type": "label" | "delivery_note",
        "carrier": "String" | null,
        "tracking_number": "String" | null,
        "company_mismatch": boolean,
        "detected_company": "String" | null,
        "marketplace": "String" | null
      }
    `

    let mimeType = imageFile.type
    if (!mimeType || mimeType === 'application/octet-stream') {
      mimeType = 'image/jpeg'
    }

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType
        }
      }
    ])

    const responseText = result.response.text().trim()
    console.log('AI Analysis Result for Company', company.name, ':', responseText)
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    const cleanJson = jsonMatch ? jsonMatch[0] : responseText
    
    const parsedData = JSON.parse(cleanJson)

    // Ensure order_number and other crucial string fields are actual strings (prevents crashes when integers are returned for delivery notes)
    if (parsedData.order_number !== undefined && parsedData.order_number !== null) {
      parsedData.order_number = String(parsedData.order_number)
    }
    if (parsedData.customer_name !== undefined && parsedData.customer_name !== null) {
      parsedData.customer_name = String(parsedData.customer_name)
    }

    // Match with database order and auto-populate metadata & items if needed
    const scanInput = parsedData.order_number?.trim()
    if (scanInput) {
      const matchedOrder = await db.query.orders.findFirst({
        where: and(
          eq(orders.companyId, company.id),
          or(
            eq(orders.marketplaceOrderId, scanInput),
            eq(orders.trackingNumber, scanInput),
            eq(orders.returnTrackingNumber, scanInput)
          )
        ),
        with: {
          items: true
        }
      })

      if (matchedOrder) {
        // Correct order number if a tracking number was scanned
        parsedData.order_number = matchedOrder.marketplaceOrderId

        // Resolve marketplace
        if (!parsedData.marketplace && matchedOrder.marketplace) {
          const rawMp = String(matchedOrder.marketplace).trim()
          if (rawMp) {
            parsedData.marketplace = rawMp.charAt(0).toUpperCase() + rawMp.slice(1)
          }
        }

        // Resolve customer name if missing or generic
        if (!parsedData.customer_name || parsedData.customer_name === 'N/A') {
          parsedData.customer_name = matchedOrder.buyerName || matchedOrder.shippingName || parsedData.customer_name
        }

        // Resolve shipping address if missing
        if (!parsedData.shipping_address || parsedData.shipping_address === 'N/A') {
          parsedData.shipping_address = [
            matchedOrder.shippingName || matchedOrder.buyerName || '',
            matchedOrder.shippingStreet || '',
            `${matchedOrder.shippingZip || ''} ${matchedOrder.shippingCity || ''}`.trim(),
            matchedOrder.shippingCountry || ''
          ].filter(Boolean).join('\n')
        }

        // Auto-populate items from order if no items were parsed from image (e.g. only shipping label scanned)
        if (matchedOrder.items && (!parsedData.items || parsedData.items.length === 0)) {
          parsedData.items = matchedOrder.items.map((item: any) => ({
            sku: item.sku || item.title || 'Unknown',
            quantity: parseInt(item.quantity) || 1
          }))
        }
      } else {
        // Try pattern-based marketplace guessing if no order matched
        if (!parsedData.marketplace) {
          const cleanNum = scanInput.replace(/\s+/g, '')
          if (/^\d{3}-\d{7}-\d{7}$/.test(cleanNum)) {
            parsedData.marketplace = 'Amazon'
          } else if (/^\d{12}$/.test(cleanNum) || /^\d{2}-\d{5}-\d{5}$/.test(cleanNum)) {
            parsedData.marketplace = 'eBay'
          } else if (/^105\d{11}$/.test(cleanNum)) {
            parsedData.marketplace = 'Zalando'
          } else if (/^10\d{8}$/.test(cleanNum) || /^20\d{8}$/.test(cleanNum) || /^cbn/i.test(cleanNum)) {
            parsedData.marketplace = 'Otto'
          }
        }
      }
    }

    return NextResponse.json(parsedData, { headers: MOBILE_SAFE_HEADERS })
  } catch (error: any) {
    console.error('AI Analysis Error:', error)
    return NextResponse.json({ error: 'Analysis failed', details: error.message }, { status: 500, headers: MOBILE_SAFE_HEADERS })
  }
}

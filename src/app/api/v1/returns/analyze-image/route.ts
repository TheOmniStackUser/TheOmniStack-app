import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { orders } from '@/db/schema/orders'
import { eq, and } from 'drizzle-orm'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) return NextResponse.json({ error: 'Missing API Key' }, { status: 401 })

  const [company] = await db.select().from(companies).where(eq(companies.apiKey, apiKey)).limit(1)
  if (!company) return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 })

  try {
    const formData = await req.formData()
    const imageFile = formData.get('image') as File
    if (!imageFile) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const arrayBuffer = await imageFile.arrayBuffer()
    const base64Image = Buffer.from(arrayBuffer).toString('base64')

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      generationConfig: { responseMimeType: "application/json" }
    })
    
    const prompt = `
      Du bist ein Experte für Logistik-Belege.
      Der aktive Händler in diesem System heißt: "${company.name}".

      Analysiere das Bild und extrahiere die Daten STRENG nach diesen Regeln:

      1. BESTELLNUMMER (order_number): 
         - Auf dem HERMES Label: Suche nach "ReferenzNr." (z.B. cbn4xbrc7k). Das ist die wichtigste ID!
         - Auf dem LIEFERSCHEIN: Suche nach "Ihre Bestellung Nr." oder "Lieferschein" (z.B. 44440).
      
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

      ANTWORTE NUR ALS JSON:
      {
        "order_number": "String",
        "customer_name": "String",
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

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: imageFile.type
        }
      }
    ])

    const responseText = result.response.text().trim()
    console.log('AI Analysis Result for Company', company.name, ':', responseText)
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    const cleanJson = jsonMatch ? jsonMatch[0] : responseText
    
    const parsedData = JSON.parse(cleanJson)

    // Apply database lookup and pattern-based guessing to assist image analysis
    if (!parsedData.marketplace && parsedData.order_number) {
      // 1. Try database lookup!
      const matchedOrder = await db.query.orders.findFirst({
        where: and(
          eq(orders.companyId, company.id),
          eq(orders.marketplaceOrderId, parsedData.order_number)
        )
      })

      if (matchedOrder?.marketplace) {
        const rawMp = matchedOrder.marketplace
        parsedData.marketplace = rawMp.charAt(0).toUpperCase() + rawMp.slice(1)
      } else {
        // 2. Try pattern guessing!
        const cleanNum = parsedData.order_number.trim().replace(/\s+/g, '')
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

    return NextResponse.json(parsedData)
  } catch (error: any) {
    console.error('AI Analysis Error:', error)
    return NextResponse.json({ error: 'Analysis failed', details: error.message }, { status: 500 })
  }
}

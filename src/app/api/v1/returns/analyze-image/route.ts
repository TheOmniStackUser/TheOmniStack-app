import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'

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
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: "application/json" }
    })
    
    const prompt = `
      Du bist ein Experte für Logistik-Belege der Marke "PEROYORK".
      Analysiere das Bild und extrahiere die Daten STRENG nach diesen Regeln:

      1. BESTELLNUMMER (order_number): 
         - Auf dem HERMES Label: Suche nach "ReferenzNr." (z.B. cbn4xbrc7k). Das ist die wichtigste ID!
         - Auf dem LIEFERSCHEIN: Suche nach "Ihre Bestellung Nr." oder "Lieferschein" (z.B. 44440).
      
      2. KUNDE (customer_name):
         - Der Name unter "Absender" (Label) oder oben links (Lieferschein), z.B. "Carmen Hinkel".

      3. ARTIKEL (items):
         - Suche in der Tabelle nach "Art-Nr." (z.B. v84-Badehose-LuV-TS08-Blau-L).
         - Extrahiere die dazugehörige "Menge" (z.B. 1).

      ANTWORTE NUR ALS JSON:
      {
        "order_number": "String",
        "customer_name": "String",
        "items": [
          { "sku": "String", "quantity": number }
        ],
        "document_type": "label" | "delivery_note"
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
    
    return NextResponse.json(JSON.parse(cleanJson))
  } catch (error: any) {
    console.error('AI Analysis Error:', error)
    return NextResponse.json({ error: 'Analysis failed', details: error.message }, { status: 500 })
  }
}

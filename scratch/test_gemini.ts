import { GoogleGenerativeAI } from '@google/generative-ai'
import * as fs from 'fs'
import * as path from 'path'

// Get key from environment
const apiKey = 'AIzaSyCsajjv733r3mJuDB_8GB0c9zCNYQFGUWM'
const genAI = new GoogleGenerativeAI(apiKey)

async function testImage(imagePath: string, docType: string) {
  try {
    const fullPath = path.resolve(imagePath)
    if (!fs.existsSync(fullPath)) {
      console.error(`File does not exist: ${fullPath}`)
      return
    }

    const data = fs.readFileSync(fullPath)
    const base64Image = data.toString('base64')
    const mimeType = imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png'

    console.log(`\n--- Testing ${docType} (${imagePath}) ---`)
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

      4. VERSANDDIENSTLEISTER (carrier):
         - Falls es ein Versandlabel ist, suche nach dem Logo oder Text "Hermes" oder "DHL" und gib "Hermes" oder "DHL" zurück.

      5. PAKETNUMMER / RETOURENNUMMER (tracking_number):
         - Falls es ein Hermes Label ist, suche nach der Paketnummer, die mit "H" beginnt gefolgt von Ziffern (z.B. H1400000019229621034).
         - Falls es ein DHL Label ist, suche nach der Sendungsnummer.

      ANTWORTE NUR ALS JSON:
      {
        "order_number": "String",
        "customer_name": "String",
        "items": [
          { "sku": "String", "quantity": number }
        ],
        "document_type": "label" | "delivery_note",
        "carrier": "String" | null,
        "tracking_number": "String" | null
      }
    `

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType
        }
      }
    ])

    console.log("Raw Response:")
    console.log(result.response.text())
  } catch (error) {
    console.error("Error during test:", error)
  }
}

async function main() {
  await testImage('./scratch/media__1778959937598.png', 'Hermes Label')
  await testImage('./scratch/media__1778959986561.png', 'Lieferschein')
}

main()

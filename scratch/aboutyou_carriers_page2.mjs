import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    const [integration] = await sql`
      SELECT api_key 
      FROM marketplace_integrations 
      WHERE type = 'aboutyou' AND is_active = true
      LIMIT 1
    `
    if (!integration || !integration.api_key) {
      console.error("No active About You integration found.")
      process.exit(1)
    }

    const apiKey = integration.api_key
    const url = 'https://partner.aboutyou.com/api/v1/orders/carriers/?page=2'
    
    console.log(`GET ${url}...`)
    const res = await fetch(url, {
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json'
      }
    })
    console.log(`Response Status: ${res.status}`)
    if (res.ok) {
      const data = await res.json()
      console.log("Carriers Page 2:", JSON.stringify(data, null, 2))
    } else {
      console.log(`Failed: ${await res.text()}`)
    }
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()

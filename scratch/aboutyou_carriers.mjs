import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    const integrations = await sql`
      SELECT id, company_id, is_active, environment, api_key 
      FROM marketplace_integrations 
      WHERE type = 'aboutyou' AND is_active = true
    `
    
    for (const integration of integrations) {
      console.log(`\n--- Fetching carriers for Integration ID: ${integration.id} (Company: ${integration.company_id}) ---`)
      const apiKey = integration.api_key
      if (!apiKey) {
        console.log("No API Key found")
        continue
      }
      
      const urlWithSlash = 'https://partner.aboutyou.com/api/v1/orders/carriers/'
      console.log(`GET ${urlWithSlash}...`)
      try {
        const res = await fetch(urlWithSlash, {
          headers: {
            'X-API-Key': apiKey,
            'Accept': 'application/json'
          }
        })
        console.log(`Response Status: ${res.status}`)
        if (res.ok) {
          const data = await res.json()
          console.log("Carriers:", JSON.stringify(data, null, 2))
        } else {
          console.log(`Failed: ${await res.text()}`)
        }
      } catch (err) {
        console.error("Fetch failed:", err.message)
      }
    }
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()

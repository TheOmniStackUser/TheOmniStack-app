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
    
    // Test GET /orders/carriers/ (with trailing slash)
    const resWithSlash = await fetch('https://partner.aboutyou.com/api/v1/orders/carriers/', {
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' }
    })
    console.log(`GET /orders/carriers/ (with slash): Status = ${resWithSlash.status}, Redirected = ${resWithSlash.redirected}`)

    // Test GET /orders/carriers (without trailing slash)
    const resWithoutSlash = await fetch('https://partner.aboutyou.com/api/v1/orders/carriers', {
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' }
    })
    console.log(`GET /orders/carriers (without slash): Status = ${resWithoutSlash.status}, Redirected = ${resWithoutSlash.redirected}`)
    
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()

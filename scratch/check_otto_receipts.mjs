import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL)

async function main() {
  try {
    const salesOrderId = 'bc4d4ac1-ba8e-4503-a7a2-537901604239'

    // 1. Fetch order details
    const [order] = await sql`
      SELECT id, company_id, marketplace, marketplace_order_id, status, tracking_number, invoice_id, created_at
      FROM orders
      WHERE marketplace_order_id = ${salesOrderId} OR id = ${salesOrderId}
      LIMIT 1
    `

    if (!order) {
      console.error(`Order ${salesOrderId} not found in DB!`)
      process.exit(1)
    }

    console.log('Order found in DB:', order)

    // 2. Fetch Otto integration
    const [integration] = await sql`
      SELECT id, environment, client_id, client_secret, metadata, is_active
      FROM marketplace_integrations
      WHERE company_id = ${order.company_id} AND type = 'otto' AND is_active = true
      LIMIT 1
    `

    if (!integration) {
      console.error(`No active Otto integration found for company ${order.company_id}!`)
      process.exit(1)
    }

    console.log('Otto Integration found:', {
      id: integration.id,
      environment: integration.environment,
      clientId: integration.client_id ? 'Set' : 'Not Set',
      clientSecret: integration.client_secret ? 'Set' : 'Not Set',
      metadata: integration.metadata
    })

    // 3. Authenticate with Otto
    const env = integration.environment || 'production'
    const baseUrl = env === 'sandbox' 
      ? 'https://sandbox.api.otto.market' 
      : 'https://api.otto.market'

    const tokenUrl = `${baseUrl}/v1/token`
    const basicAuth = Buffer.from(`${integration.client_id}:${integration.client_secret}`).toString('base64')
    
    console.log(`🔑 Fetching Access Token from ${tokenUrl}...`)
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'orders receipts shipments',
      }).toString(),
    })

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text()
      throw new Error(`Token request failed: ${tokenResponse.status} - ${errText}`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    console.log('Token fetched successfully.')

    // 4. Query receipts
    const listUrl = `${baseUrl}/v3/receipts?salesOrderId=${order.marketplace_order_id}`
    console.log(`--- Fetching Receipts for salesOrderId ${order.marketplace_order_id} ---`)
    const response = await fetch(listUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    })

    console.log(`Status: ${response.status}`)
    const text = await response.text()
    console.log(`Response Body:`)
    console.log(text)

    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()

import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq } from 'drizzle-orm'

async function run() {
  const marketplaceOrderId = '4e6180ea-e886-4257-835d-b6c41790e112'
  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(eq(marketplaceIntegrations.id, '6e9413ed-2bfc-4458-bdf8-9a41f85d466b'))
    .limit(1)

  if (!integration) throw new Error('Integration not found')

  // Get token URL and exchange token
  const tokenUrl = 'https://api.otto.market/v1/token'
  const basicAuth = Buffer.from(`${integration.clientId}:${integration.clientSecret}`).toString('base64')
  
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

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token

  // Fetch receipts list
  const listUrl = `https://api.otto.market/v3/receipts?salesOrderId=${marketplaceOrderId}`
  console.log('Fetching receipts from URL:', listUrl)
  const response = await fetch(listUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  })

  console.log('Response Status:', response.status)
  const text = await response.text()
  console.log('Response Body:')
  console.log(text)

  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})

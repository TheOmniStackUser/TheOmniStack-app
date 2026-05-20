import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

async function run() {
  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'),
        eq(marketplaceIntegrations.type, 'otto')
      )
    )
    .limit(1)

  if (!integration) {
    console.error('No Otto integration found')
    return
  }

  const clientId = integration.clientId!
  const clientSecret = integration.clientSecret!

  // Fetch developer token
  const tokenResponse = await fetch('https://sandbox.api.otto.market/v1/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'developer'
    }).toString()
  })

  const tokenData = await tokenResponse.json()
  const devToken = tokenData.access_token

  const appId = 'b979c7bd-7e50-4b0e-bae2-d41d5fd2c1d7'
  const installationId = '24a7db88-a4d4-4fe2-812c-4d9b67ffe17b'

  const installTokenUrl = `https://sandbox.api.otto.market/v1/apps/${appId}/installations/${installationId}/accessToken`

  const combinations = [
    {
      name: 'Bearer Token (Developer Access Token)',
      headers: {
        'Authorization': `Bearer ${devToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': '0'
      }
    },
    {
      name: 'Basic Auth (ClientId:ClientSecret)',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': '0'
      }
    }
  ]

  for (const c of combinations) {
    console.log(`\n--- Testing ${c.name} ---`)
    const res = await fetch(installTokenUrl, {
      method: 'POST',
      headers: c.headers
    })

    console.log(`Status: ${res.status}`)
    console.log(`Body: ${await res.text()}`)
  }

  process.exit(0)
}

run().catch(console.error)

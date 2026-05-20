import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

async function run() {
  const companyId = 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'

  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, companyId),
        eq(marketplaceIntegrations.type, 'otto'),
        eq(marketplaceIntegrations.environment, 'sandbox')
      )
    )
    .limit(1)

  if (!integration) {
    console.error('No sandbox Otto integration found')
    return
  }

  const clientId = integration.clientId!
  const clientSecret = integration.clientSecret!
  const appId = (integration.metadata as any)?.appId
  const installationId = (integration.metadata as any)?.installationId

  // Get developer token
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const devRes = await fetch('https://sandbox.api.otto.market/sec-api/auth/realms/deepsea-sandbox/protocol/openid-connect/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'developer'
    })
  })
  const devData = await devRes.json()
  const devToken = devData.access_token

  // Try different scope combinations
  const scopesToTry = [
    'orders receipts shipments returns',
    'orders receipts shipments Returns',
    'orders receipts shipments return',
    'orders receipts shipments Return',
    'returns',
    'Returns'
  ]

  for (const scopes of scopesToTry) {
    console.log(`\nTrying scope: "${scopes}"`)
    const res = await fetch(`https://sandbox.api.otto.market/v1/apps/${appId}/installations/${installationId}/accessToken`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${devToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: scopes
      })
    })

    console.log(`Status: ${res.status}`)
    try {
      const data = await res.json()
      console.log(`Success: ${!!data.access_token}`)
      if (data.access_token) {
        console.log(`Granted scopes: ${data.scope}`)
      } else {
        console.log(`Response: ${JSON.stringify(data)}`)
      }
    } catch {
      console.log(`Response (text): ${await res.text()}`)
    }
  }

  process.exit(0)
}

run().catch(console.error)

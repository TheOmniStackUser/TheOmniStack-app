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

  if (!tokenResponse.ok) {
    console.error('Failed to get developer token')
    return
  }

  const tokenData = await tokenResponse.json()
  const devToken = tokenData.access_token

  try {
    const parts = devToken.split('.')
    if (parts.length === 3) {
      const payload = Buffer.from(parts[1], 'base64').toString('utf-8')
      console.log('Decoded JWT Developer Token Payload:')
      console.log(JSON.stringify(JSON.parse(payload), null, 2))
    }
  } catch (jwtErr) {
    console.error('Failed to decode JWT token:', jwtErr)
  }

  process.exit(0)
}

run().catch(console.error)

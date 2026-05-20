import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

async function check() {
  const integration = await db.query.marketplaceIntegrations.findFirst({
    where: and(
      eq(marketplaceIntegrations.type, 'otto'),
      eq(marketplaceIntegrations.environment, 'sandbox')
    )
  })

  if (!integration || !integration.clientId || !integration.clientSecret) {
    console.error('No Otto integration found')
    return
  }

  // Get developer access token
  const tokenUrl = 'https://sandbox.api.otto.market/oauth2/token'
  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: integration.clientId,
      client_secret: integration.clientSecret,
      scope: 'developer',
    }).toString(),
  })

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token

  // Use appId from Sandbox App Details screenshot
  const appId = 'b979c7bd-7e50-4b0e-bae2-d41d5fd2c1d7'

  console.log(`Using appId: ${appId}`)

  // 1. Try GET /v1/apps/{appId}/installations
  console.log('\n--- Trying GET /v1/apps/{appId}/installations ---')
  const res1 = await fetch(`https://sandbox.api.otto.market/v1/apps/${appId}/installations`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    }
  })
  console.log('Status:', res1.status)
  console.log('Body:', await res1.text())

  // 2. Try GET /v1/apps/{appId}/installation
  console.log('\n--- Trying GET /v1/apps/{appId}/installation ---')
  const res2 = await fetch(`https://sandbox.api.otto.market/v1/apps/${appId}/installation`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    }
  })
  console.log('Status:', res2.status)
  console.log('Body:', await res2.text())
}

check().catch(console.error)

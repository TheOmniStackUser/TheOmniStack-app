import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

async function run() {
  const code = 'da422bbc-2def-8ef6-8a6a-220eeee19564.638d63d3-dee1-6d19-4c66-2ba9a2dc96e9.e6616b66-619c-4b91-8553-efb23a372333'
  const redirectUri = 'https://www.theomnistack.de/api/auth/callback/otto'
  const appId = '6a0c0a71102c6f4203615ea3'

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

  console.log('--- 1. Exchanging Authorization Code ---')
  const tokenResponse = await fetch('https://sandbox.api.otto.market/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })

  if (!tokenResponse.ok) {
    console.error(`Token exchange failed: ${tokenResponse.status} - ${await tokenResponse.text()}`)
    return
  }

  const tokenData = await tokenResponse.json()
  const userAccessToken = tokenData.access_token
  console.log('Successfully obtained User Access Token.')

  console.log(`\n--- 2. Fetching Installation Details for App ID ${appId} ---`)
  const res = await fetch(`https://sandbox.api.otto.market/v1/apps/${appId}/installation`, {
    headers: {
      'Authorization': `Bearer ${userAccessToken}`,
      'Accept': 'application/json',
    }
  })

  if (!res.ok) {
    console.error(`Failed to fetch installation: ${res.status} - ${await res.text()}`)
    return
  }

  const installData = await res.json()
  const installationId = installData.id || installData.installationId
  console.log(`Successfully retrieved installationId: ${installationId}`)
  console.log('Full installation payload:', JSON.stringify(installData, null, 2))

  // Update Database
  const metadata = {
    ...(integration.metadata as any || {}),
    installationId,
    appId
  }

  await db
    .update(marketplaceIntegrations)
    .set({
      metadata,
      updatedAt: new Date()
    })
    .where(eq(marketplaceIntegrations.id, integration.id))

  console.log('Database updated with new metadata!')

  // 3. Test exchanging for Installation Token
  console.log('\n--- 3. Testing Developer Token to Installation Token exchange ---')
  const devTokenResponse = await fetch('https://sandbox.api.otto.market/v1/token', {
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

  const devTokenData = await devTokenResponse.json()
  const devToken = devTokenData.access_token

  const installTokenUrl = `https://sandbox.api.otto.market/v1/apps/${appId}/installations/${installationId}/accessToken`
  const installTokenRes = await fetch(installTokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${devToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': '0'
    }
  })

  console.log(`Response status: ${installTokenRes.status}`)
  console.log(`Response body: ${await installTokenRes.text()}`)

  process.exit(0)
}

run().catch(console.error)

import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

async function run() {
  const code = 'da422bbc-2def-8ef6-8a6a-220eeee19564.638d63d3-dee1-6d19-4c66-2ba9a2dc96e9.e6616b66-619c-4b91-8553-efb23a372333'
  const redirectUri = 'https://www.theomnistack.de/api/auth/callback/otto'
  const appIds = ['b979c7bd-7e50-4b0e-bae2-d41d5fd2c1d7', '69eb5ed304bb0234c14c27b5']

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

  console.log('--- 1. Exchanging Authorization Code for User Access Token ---')
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

  console.log('\n--- 2. Fetching Installation Details for each App ID ---')
  const installations: { appId: string; installationId: string }[] = []
  
  for (const appId of appIds) {
    console.log(`\nQuerying installation for App ID: ${appId}...`)
    const res = await fetch(`https://sandbox.api.otto.market/v1/apps/${appId}/installation`, {
      headers: {
        'Authorization': `Bearer ${userAccessToken}`,
        'Accept': 'application/json',
      }
    })

    console.log(`Status: ${res.status}`)
    const text = await res.text()
    console.log(`Body: ${text}`)
    
    if (res.ok) {
      const data = JSON.parse(text)
      const installationId = data.id || data.installationId
      if (installationId) {
        installations.push({ appId, installationId })
      }
    }
  }

  if (installations.length === 0) {
    console.log('\n❌ No installations found for either App ID.')
    return
  }

  console.log('\n--- 3. Fetching Developer Token using Client Credentials ---')
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

  if (!devTokenResponse.ok) {
    console.error(`Failed to get developer token: ${devTokenResponse.status} - ${await devTokenResponse.text()}`)
    return
  }

  const devTokenData = await devTokenResponse.json()
  const devToken = devTokenData.access_token
  console.log('Successfully obtained Developer Access Token.')

  console.log('\n--- 4. Testing Installation Access Token Exchange variations ---')
  for (const inst of installations) {
    const installTokenUrl = `https://sandbox.api.otto.market/v1/apps/${inst.appId}/installations/${inst.installationId}/accessToken`
    console.log(`\nTesting Installation: App ID ${inst.appId}, Installation ID ${inst.installationId}`)
    
    // Let's try sending NO body vs sending body, and see if any work
    const variations = [
      {
        name: 'Empty body (Content-Length: 0)',
        headers: {
          'Authorization': `Bearer ${devToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': '0'
        },
        body: ''
      },
      {
        name: 'Passing appId and installationId in form body',
        headers: {
          'Authorization': `Bearer ${devToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          appId: inst.appId,
          installationId: inst.installationId
        }).toString()
      }
    ]

    for (const v of variations) {
      console.log(`  -> Variation: ${v.name}`)
      const res = await fetch(installTokenUrl, {
        method: 'POST',
        headers: v.headers,
        body: v.body
      })
      console.log(`     Status: ${res.status}`)
      console.log(`     Body: ${await res.text()}`)
    }
  }

  process.exit(0)
}

run().catch(console.error)

import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

async function exchange() {
  const code = '47cbe68f-6ca0-410e-8cb5-e40f35fc0673.75b40ff6-e4d6-3b15-849c-24d858db6cbb.c6411516-f3f2-4934-bc2c-550fae94d872'
  const redirectUri = 'https://www.theomnistack.de/api/auth/callback/otto'
  const appId1 = 'b979c7bd-7e50-4b0e-bae2-d41d5fd2c1d7'
  const appId2 = '69eb5ed304bb0234c14c27b5'

  console.log('Retrieving sandbox integration credentials...')
  const integration = await db.query.marketplaceIntegrations.findFirst({
    where: and(
      eq(marketplaceIntegrations.type, 'otto'),
      eq(marketplaceIntegrations.environment, 'sandbox')
    )
  })

  if (!integration || !integration.clientId || !integration.clientSecret) {
    console.error('No Otto sandbox integration found in DB')
    return
  }

  console.log(`Exchanging code for token using Client ID: ${integration.clientId}...`)
  const tokenUrl = 'https://sandbox.api.otto.market/oauth2/token'
  
  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: integration.clientId,
      client_secret: integration.clientSecret,
    }).toString(),
  })

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text()
    console.error(`Token exchange failed: ${tokenResponse.status} - ${errText}`)
    return
  }

  const tokenData = await tokenResponse.json()
  const userAccessToken = tokenData.access_token
  console.log('Token successfully exchanged!')

  console.log('Fetching installation ID from /v1/apps/{appId}/installation...')
  let installationId = ''
  let finalAppId = ''
  
  for (const currentAppId of [appId1, appId2]) {
    console.log(`Trying App ID: ${currentAppId}...`)
    const installResponse = await fetch(`https://sandbox.api.otto.market/v1/apps/${currentAppId}/installation`, {
      headers: {
        'Authorization': `Bearer ${userAccessToken}`,
        'Accept': 'application/json',
      }
    })

    if (installResponse.ok) {
      const installData = await installResponse.json()
      console.log('Installation Data:', JSON.stringify(installData, null, 2))
      installationId = installData.id || installData.installationId
      finalAppId = currentAppId
      break
    } else {
      const errText = await installResponse.text()
      console.warn(`App ID ${currentAppId} failed: ${installResponse.status} - ${errText}`)
    }
  }

  if (!installationId) {
    console.error('Could not find installation ID with either App ID')
    return
  }

  console.log(`Found installationId: ${installationId} using App ID: ${finalAppId}`)
  
  // Update integration metadata in database
  const metadata = {
    ...(integration.metadata as any || {}),
    installationId,
    appId: finalAppId
  }

  await db
    .update(marketplaceIntegrations)
    .set({
      metadata,
      updatedAt: new Date()
    })
    .where(eq(marketplaceIntegrations.id, integration.id))

  console.log('Database successfully updated with installationId!')
}

exchange().catch(console.error)

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  let state = searchParams.get('state')
  const iss = searchParams.get('iss') || ''

  // Fallback for Sandbox Installation without state
  if (!state) {
    state = 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'
  }

  console.log(`[Otto OAuth Callback] Received callback with code: ${code ? 'PRESENT' : 'MISSING'}, state: ${state}, iss: ${iss}`)

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state parameter' }, { status: 400 })
  }

  // Determine environment based on issuer URL
  const environment = iss.includes('sandbox') ? 'sandbox' : 'production'
  const baseUrl = environment === 'sandbox' ? 'https://sandbox.api.otto.market' : 'https://api.otto.market'
  const requestHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'app.theomnistack.de'
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const redirectUri = `${proto}://${requestHost}/api/auth/callback/otto`

  try {
    // Find matching Otto integration for the given company and environment
    const integration = await db.query.marketplaceIntegrations.findFirst({
      where: and(
        eq(marketplaceIntegrations.companyId, state),
        eq(marketplaceIntegrations.type, 'otto'),
        eq(marketplaceIntegrations.environment, environment)
      )
    })

    if (!integration || !integration.clientId || !integration.clientSecret) {
      console.error(`[Otto OAuth Callback] No matching ${environment} integration found for company: ${state}`)
      return NextResponse.json({ error: 'No matching integration configuration found' }, { status: 400 })
    }

    console.log(`[Otto OAuth Callback] Exchanging code for token using Client ID: ${integration.clientId}...`)
    const tokenResponse = await fetch(`${baseUrl}/oauth2/token`, {
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
      console.error(`[Otto OAuth Callback] Token exchange failed: ${tokenResponse.status} - ${errText}`)
      return NextResponse.json({ error: 'Failed to exchange authorization code for token', details: errText }, { status: 400 })
    }

    const tokenData = await tokenResponse.json()
    const userAccessToken = tokenData.access_token

    // Attempt to query the installation ID using potential App IDs
    // For sandbox, we try the V2, V3, and V4 App IDs
    const appIdsToTry = environment === 'sandbox' 
      ? [
          '6a26b8f2905ebc23fd43ad87', // V4 App ID
          'b5761696-72b1-4193-9995-0006d62e85ee', // V4 Public App ID
          '6a0c0a71102c6f4203615ea3', 
          'b979c7bd-7e50-4b0e-bae2-d41d5fd2c1d7', 
          '69eb5ed304bb0234c14c27b5'
        ]
      : ['6a0c0a71102c6f4203615ea3', '69eb5ed304bb0234c14c27b5']

    let installationId = ''
    let finalAppId = ''

    for (const appId of appIdsToTry) {
      console.log(`[Otto OAuth Callback] Fetching installation ID with App ID: ${appId}...`)
      const installResponse = await fetch(`${baseUrl}/v1/apps/${appId}/installation`, {
        headers: {
          'Authorization': `Bearer ${userAccessToken}`,
          'Accept': 'application/json',
        }
      })

      if (installResponse.ok) {
        const installData = await installResponse.json()
        installationId = installData.id || installData.installationId
        finalAppId = appId
        console.log(`[Otto OAuth Callback] Successfully retrieved installationId: ${installationId}`)
        break
      } else {
        const errText = await installResponse.text()
        console.warn(`[Otto OAuth Callback] App ID ${appId} failed: ${installResponse.status} - ${errText}`)
      }
    }

    if (!installationId) {
      console.error('[Otto OAuth Callback] Could not retrieve installation ID with any of the configured App IDs')
      return NextResponse.json({ error: 'Failed to retrieve installation details from Otto' }, { status: 400 })
    }

    // Save installationId and appId to the integration record's metadata
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

    console.log(`[Otto OAuth Callback] Integration successfully updated in database!`)

    // Redirect the user back to the integrations settings page with a success message
    const requestHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000'
    const proto = request.headers.get('x-forwarded-proto') || 'http'
    const targetUrl = new URL('/integrations', `${proto}://${requestHost}`)
    targetUrl.searchParams.set('status', 'otto_success')
    return NextResponse.redirect(targetUrl)

  } catch (error: any) {
    console.error('[Otto OAuth Callback] Unexpected error during OAuth callback handling:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}

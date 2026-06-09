import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  let state = searchParams.get('state')
  const iss = searchParams.get('iss') || ''

  // Log IMMEDIATELY so we always see it in Vercel, even if something fails later
  console.log(`[Otto OAuth Callback] *** CALLBACK RECEIVED *** code=${code ? 'YES' : 'NO'} state=${state || 'MISSING'} iss=${iss}`)

  // Fallback 1: Cookie set by our form before redirecting to OTTO
  if (!state) {
    state = request.cookies.get('otto_oauth_company_id')?.value || ''
    if (state) {
      console.log(`[Otto OAuth Callback] Recovered company ID from cookie: ${state}`)
    }
  }

  console.log(`[Otto OAuth Callback] Received callback with code: ${code ? 'PRESENT' : 'MISSING'}, state: ${state}, iss: ${iss}`)

  if (!code) {
    return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 })
  }

  // Determine environment based on issuer URL
  const environment = iss.includes('sandbox') ? 'sandbox' : 'production'
  const baseUrl = environment === 'sandbox' ? 'https://sandbox.api.otto.market' : 'https://api.otto.market'
  const requestHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'app.theomnistack.de'
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const redirectUri = `${proto}://${requestHost}/api/auth/callback/otto`

  try {
    // Find matching Otto integration for the given company and environment
    let integration = state ? await db.query.marketplaceIntegrations.findFirst({
      where: and(
        eq(marketplaceIntegrations.companyId, state),
        eq(marketplaceIntegrations.type, 'otto'),
        eq(marketplaceIntegrations.environment, environment)
      )
    }) : null

    // Fallback 2: If state is missing, find the most recently updated integration
    if (!integration && !state) {
      console.warn(`[Otto OAuth Callback] No state parameter. Searching for a pending ${environment} integration...`)
      // Use simple query without orderBy to avoid potential type errors
      const allIntegrations = await db.query.marketplaceIntegrations.findMany({
        where: and(
          eq(marketplaceIntegrations.type, 'otto'),
          eq(marketplaceIntegrations.environment, environment)
        )
      })
      // Sort in JS to avoid Drizzle orderBy syntax issues
      const sorted = allIntegrations.sort((a, b) => 
        new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
      )
      integration = sorted[0] || null
      if (integration) {
        console.log(`[Otto OAuth Callback] Found fallback integration for company: ${integration.companyId}`)
        state = integration.companyId
      }
    }

    if (!integration && state) {
      console.log(`[Otto OAuth Callback] No existing integration found. Creating new one for company: ${state}`)
      const [newIntegration] = await db.insert(marketplaceIntegrations).values({
        companyId: state,
        type: 'otto',
        environment: environment,
        isActive: true,
        metadata: {},
      }).returning()
      integration = newIntegration
    }

    if (!integration) {
      return NextResponse.json({ error: 'Could not identify company for this OAuth callback. Please try connecting again from the integrations page.' }, { status: 400 })
    }

    let appClientId = process.env.OTTO_APP_CLIENT_ID || '9c74d78a-cc67-412f-8d25-7652b43ac41b'
    let appClientSecret = process.env.OTTO_APP_CLIENT_SECRET || 'f9600fd0-6cc2-4b77-a692-b472d65d331c'
    
    // Override with Sandbox credentials if in sandbox environment
    if (environment === 'sandbox') {
      appClientId = process.env.OTTO_SANDBOX_APP_CLIENT_ID || '0bf6d71a-ed4b-4fb7-a7a1-445878d75912'
      appClientSecret = process.env.OTTO_SANDBOX_APP_CLIENT_SECRET || '5d40460c-bec7-4c8c-9586-6ff3ba2e2f6d'
    }

    console.log(`[Otto OAuth Callback] Exchanging code for token using Global App Client ID: ${appClientId}...`)
    const tokenResponse = await fetch(`${baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: appClientId,
        client_secret: appClientSecret,
        scope: 'shipments availability orders returns products price-reduction receipts'
      }).toString().replace(/\+/g, '%20'),
    })

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text()
      console.error(`[Otto OAuth Callback] Token exchange failed: ${tokenResponse.status} - ${errText}`)
      return NextResponse.json({ error: 'Failed to exchange authorization code for token', details: errText }, { status: 400 })
    }

    const tokenData = await tokenResponse.json()
    let userAccessToken = tokenData.access_token

    // Attempt to query the installation ID using potential App IDs
    // For sandbox, we try the V2, V3, and V4 App IDs
    const appIdsToTry = environment === 'sandbox' 
      ? [
          '507227cf-0da3-47a6-8180-a97642e792b0', // NEW App ID from Alexander
          '058cc42c-8af7-4e48-8ca7-25437c08f5a8', // Old App ID
          '6a26b8f2905ebc23fd43ad87', // V4 App ID
          'b5761696-72b1-4193-9995-0006d62e85ee', // V4 Public App ID
          '6a0c0a71102c6f4203615ea3', 
          'b979c7bd-7e50-4b0e-bae2-d41d5fd2c1d7', 
          '69eb5ed304bb0234c14c27b5'
        ]
      : ['fb5f4e1a-5a8f-4eb3-89b1-237f359d4709', '6a0c0a71102c6f4203615ea3', '69eb5ed304bb0234c14c27b5']

    let installationId = ''
    let finalAppId = ''
    const errors: any[] = []

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
        
        const fullScopes = 'shipments availability orders returns products price-reduction receipts'

        console.log(`[Otto OAuth Callback] Fetching Developer Token via client_credentials...`)
        const devTokenResponse = await fetch(`${baseUrl}/sec-api/auth/realms/deepsea-${environment}/protocol/openid-connect/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: appClientId,
            client_secret: appClientSecret,
            scope: 'installation developer'
          }).toString()
        })
        
        if (!devTokenResponse.ok) {
          throw new Error(`Failed to fetch developer token: ${await devTokenResponse.text()}`)
        }
        
        const devTokenData = await devTokenResponse.json()
        const developerToken = devTokenData.access_token

        // Step 3: Get final Installation Access Token
        console.log(`[Otto OAuth Callback] Fetching final Installation Access Token...`)
        const installAccessTokenResponse = await fetch(`${baseUrl}/v1/apps/${finalAppId}/installations/${installationId}/accessToken`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${developerToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `scope=${fullScopes.replace(/ /g, '%20')}`
        })
        
        if (!installAccessTokenResponse.ok) {
           throw new Error(`Failed to fetch final installation access token: ${await installAccessTokenResponse.text()}`)
        }
        
        const finalTokenData = await installAccessTokenResponse.json()
        
        // Save the final token
        userAccessToken = finalTokenData.access_token
        
        console.log(`[Otto OAuth Callback] Successfully retrieved final token for installationId: ${installationId}`)
        break
      } else {
        const errText = await installResponse.text()
        console.warn(`[Otto OAuth Callback] App ID ${appId} failed: ${installResponse.status} - ${errText}`)
        errors.push({ appId, status: installResponse.status, error: errText })
      }
    }

    if (!installationId) {
      console.error('[Otto OAuth Callback] Could not retrieve installation ID with any of the configured App IDs', errors)
      return NextResponse.json({ error: 'Failed to retrieve installation details from Otto', details: errors, tokenData: tokenData }, { status: 400 })
    }

    const metadata = {
      ...(integration.metadata as any || {}),
      installationId,
      appId: finalAppId
    }

    await db
      .update(marketplaceIntegrations)
      .set({
        metadata,
        accessToken: userAccessToken,
        refreshToken: tokenData.refresh_token,
        updatedAt: new Date()
      })
      .where(eq(marketplaceIntegrations.id, integration.id))

    console.log(`[Otto OAuth Callback] Integration successfully updated in database!`)

    // Redirect the user back to the integrations settings page with a success message
    const targetHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000'
    const targetProto = request.headers.get('x-forwarded-proto') || 'http'
    const targetUrl = new URL('/integrations', `${targetProto}://${targetHost}`)
    targetUrl.searchParams.set('status', 'otto_success')
    return NextResponse.redirect(targetUrl)

  } catch (error: any) {
    console.error('[Otto OAuth Callback] Unexpected error during OAuth callback handling:', error)
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 })
  }
}

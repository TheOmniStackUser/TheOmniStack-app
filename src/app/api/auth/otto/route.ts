import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const environment = searchParams.get('environment') || 'sandbox'
  const companyId = searchParams.get('companyId') || request.cookies.get('otto_oauth_company_id')?.value

  if (!companyId) {
    return NextResponse.json({ error: 'Missing company ID in cookies. Please start the connection flow from TheOmniStack integrations page.' }, { status: 400 })
  }

  // Determine environment URLs
  const baseUrl = environment === 'sandbox' ? 'https://sandbox.api.otto.market' : 'https://api.otto.market'
  const authUrl = environment === 'sandbox'
    ? 'https://sandbox.api.otto.market/sec-api/auth/realms/deepsea-sandbox/protocol/openid-connect/auth'
    : 'https://portal.otto.market/sec-api/auth/realms/otto-partner/protocol/openid-connect/auth'
  // Force redirect URI to match Otto config exactly, even if tested locally
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.theomnistack.de'
  const redirectUri = `${appUrl}/api/auth/callback/otto`

  let appClientId = process.env.OTTO_APP_CLIENT_ID || '7dad7649-bdee-4593-8a65-c74f28693507'
  if (environment === 'sandbox') {
    appClientId = process.env.OTTO_SANDBOX_APP_CLIENT_ID || '0bf6d71a-ed4b-4fb7-a7a1-445878d75912'
  }

  const oauthUrl = new URL(authUrl)
  oauthUrl.searchParams.set('client_id', appClientId)
  oauthUrl.searchParams.set('response_type', 'code')
  oauthUrl.searchParams.set('redirect_uri', redirectUri)
  // Request 'installation' and 'developer' scopes - these are allowed in the initial OAuth step!
  const scopes = 'installation developer'
  oauthUrl.searchParams.set('scope', scopes)
  
  // Some strict OAuth servers don't accept '+' for spaces in the query string, they need '%20'
  const finalUrl = oauthUrl.toString().replace(/\+/g, '%20')
  
  console.log(`[Otto OAuth Initiate] Redirecting user to OTTO Authorization page: ${finalUrl}`)
  
  return NextResponse.redirect(finalUrl)
}

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const environment = searchParams.get('environment') || 'sandbox'
  const companyId = request.cookies.get('otto_oauth_company_id')?.value

  if (!companyId) {
    return NextResponse.json({ error: 'Missing company ID in cookies. Please start the connection flow from TheOmniStack integrations page.' }, { status: 400 })
  }

  // Determine environment
  const baseUrl = environment === 'sandbox' ? 'https://sandbox.api.otto.market' : 'https://api.otto.market'
  const authUrl = `${baseUrl}/sec-api/auth/realms/deepsea-${environment}/protocol/openid-connect/auth`
  const requestHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'app.theomnistack.de'
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const redirectUri = `${proto}://${requestHost}/api/auth/callback/otto`

  let appClientId = process.env.OTTO_APP_CLIENT_ID || '9c74d78a-cc67-412f-8d25-7652b43ac41b'
  if (environment === 'sandbox') {
    appClientId = process.env.OTTO_SANDBOX_APP_CLIENT_ID || '0bf6d71a-ed4b-4fb7-a7a1-445878d75912'
  }

  const oauthUrl = new URL(authUrl)
  oauthUrl.searchParams.set('client_id', appClientId)
  oauthUrl.searchParams.set('response_type', 'code')
  oauthUrl.searchParams.set('redirect_uri', redirectUri)
  // Request only the installation scope first, this is mandatory for step 1!
  const scopes = 'installation'
  oauthUrl.searchParams.set('scope', scopes)
  
  // Some strict OAuth servers don't accept '+' for spaces in the query string, they need '%20'
  const finalUrl = oauthUrl.toString().replace(/\+/g, '%20')
  
  console.log(`[Otto OAuth Initiate] Redirecting user to OTTO Authorization page: ${finalUrl}`)
  
  return NextResponse.redirect(finalUrl)
}

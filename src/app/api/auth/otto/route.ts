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
    appClientId = process.env.OTTO_SANDBOX_APP_CLIENT_ID || '2edf221b-9fc4-489a-8eed-66e3d48e8c39'
  }

  const oauthUrl = new URL(authUrl)
  oauthUrl.searchParams.set('client_id', appClientId)
  oauthUrl.searchParams.set('response_type', 'code')
  oauthUrl.searchParams.set('redirect_uri', redirectUri)
  oauthUrl.searchParams.set('state', companyId)
  
  // WICHTIG: OTTO verlangt, dass alle Scopes explizit angefordert werden!
  const scopes = 'installation partnerId developer products orders receipts returns price-reduction shipments shipping-profiles availability returns-warehouse-read returns-warehouse-write'
  oauthUrl.searchParams.set('scope', scopes)
  
  console.log(`[Otto OAuth Initiate] Redirecting user to OTTO Authorization page: ${oauthUrl.toString()}`)
  
  return NextResponse.redirect(oauthUrl)
}

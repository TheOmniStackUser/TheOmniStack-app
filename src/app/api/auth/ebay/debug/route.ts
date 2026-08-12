import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.EBAY_CLIENT_ID || 'NOT_SET'
  const clientSecret = process.env.EBAY_CLIENT_SECRET || 'NOT_SET'
  const ruName = process.env.EBAY_RU_NAME || 'F__L_Fashion_Gm-FLFashio-TheOmn-ixunutlfx'

  const SCOPES = [
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.finances'
  ].join(' ')

  const authUrl = new URL('https://auth.ebay.com/oauth2/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', ruName)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('state', 'test-company-id')

  const finalUrl = authUrl.toString().replace(/\+/g, '%20')

  return NextResponse.json({
    clientId,
    clientSecretLength: clientSecret.length,
    clientSecretStartsWith: clientSecret.substring(0, 4),
    ruName,
    finalUrl,
    instructions: "Please copy the 'finalUrl' and paste it into your browser. If eBay still says invalid_request, then the clientId is definitely wrong in Vercel."
  })
}

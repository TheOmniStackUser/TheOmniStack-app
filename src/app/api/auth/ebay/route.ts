import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

const EBAY_OAUTH_URL = 'https://auth.ebay.com/oauth2/authorize'
const EBAY_SANDBOX_OAUTH_URL = 'https://auth.sandbox.ebay.com/oauth2/authorize'

// Scopes required for orders, inventory, and refunds
const SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.finances'
].join(' ')

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const action = searchParams.get('action')
  const companyId = searchParams.get('companyId')

  if (!companyId) {
    return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
  }

  if (action === 'connect') {
    // We use global SaaS app credentials
    const clientId = process.env.EBAY_CLIENT_ID
    const ruName = process.env.EBAY_RU_NAME || 'F__L_Fashion_Gm-FLFashio-TheOmn-ixunutlfx'
    
    // Always use production for the SaaS platform OAuth unless specified
    const isSandbox = process.env.EBAY_ENVIRONMENT === 'sandbox'

    if (!clientId) {
      return NextResponse.json({ error: 'eBay Client ID not configured in platform environment variables' }, { status: 500 })
    }

    const baseUrl = isSandbox ? EBAY_SANDBOX_OAUTH_URL : EBAY_OAUTH_URL

    const authUrl = new URL(baseUrl)
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', ruName)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', SCOPES)
    authUrl.searchParams.set('state', companyId)

    // eBay is very strict with URL encoding. URLSearchParams uses `+` for spaces, but eBay expects `%20`.
    const finalUrl = authUrl.toString().replace(/\+/g, '%20')

    return NextResponse.redirect(finalUrl)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

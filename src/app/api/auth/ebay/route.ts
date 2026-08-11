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
    // 1. Fetch the configured Client ID and RuName for this company
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.type, 'ebay')
        )
      )
      .limit(1)

    if (!integration || !integration.clientId) {
      return NextResponse.json({ error: 'eBay Client ID not configured for this company' }, { status: 400 })
    }

    const ruName = (integration.metadata as any)?.ruName
    if (!ruName) {
      return NextResponse.json({ error: 'eBay RuName not configured for this company' }, { status: 400 })
    }

    const isSandbox = integration.environment === 'sandbox'
    const baseUrl = isSandbox ? EBAY_SANDBOX_OAUTH_URL : EBAY_OAUTH_URL

    const authUrl = new URL(baseUrl)
    authUrl.searchParams.set('client_id', integration.clientId)
    authUrl.searchParams.set('redirect_uri', ruName)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', SCOPES)
    authUrl.searchParams.set('prompt', 'login')
    
    // We pass the companyId in the state parameter so we know which company to update in the callback
    authUrl.searchParams.set('state', companyId)

    return NextResponse.redirect(authUrl.toString())
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

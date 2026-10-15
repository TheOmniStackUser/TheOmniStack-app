import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const shop = searchParams.get('shop')

  // 1. Validate shop parameter
  if (!shop || !shop.match(/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com/)) {
    return new NextResponse('Invalid shop domain. Must end with .myshopify.com', { status: 400 })
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID
  if (!clientId) {
    return new NextResponse('Missing Shopify Client ID in environment variables', { status: 500 })
  }

  // 1.5 Check if already actively installed for the current logged-in company
  const { db } = await import('@/db/client')
  const { marketplaceIntegrations } = await import('@/db/schema/integrations')
  const { eq, and, isNotNull } = await import('drizzle-orm')
  const { getSession } = await import('@/lib/session')
  
  const payload = await getSession()
  const isForce = searchParams.get('force') === 'true' || searchParams.get('reconnect') === 'true'

  if (payload?.userId && payload?.activeCompanyId && !isForce) {
    const [existing] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.environment, shop),
          eq(marketplaceIntegrations.companyId, payload.activeCompanyId),
          eq(marketplaceIntegrations.isActive, true),
          isNotNull(marketplaceIntegrations.accessToken)
        )
      )
      .limit(1)

    // Only skip OAuth if already actively connected with a WORKING token for THIS company
    if (existing?.accessToken) {
      let isTokenWorking = false
      try {
        const testRes = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
          headers: { 'X-Shopify-Access-Token': existing.accessToken },
          cache: 'no-store'
        })
        if (testRes.ok) {
          isTokenWorking = true
        }
      } catch (err) {
        isTokenWorking = false
      }

      if (isTokenWorking) {
        return NextResponse.redirect(new URL('/dashboard', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'))
      }
    }
  }

  // 2. Define required scopes for TheOmniStack
  const scopes = 'read_orders,write_orders,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,read_products,write_products,read_inventory,write_inventory,read_locations'
  
  // 3. Generate CSRF protection nonce
  const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

  // 4. Set the nonce in an encrypted cookie to verify it later in the callback
  const cookieStore = await cookies()
  const isLocalhost = (process.env.NEXT_PUBLIC_APP_URL || '').startsWith('http://localhost')
  cookieStore.set('shopify_oauth_nonce', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !isLocalhost,
    sameSite: 'lax',
    maxAge: 60 * 10 // 10 minutes expiry
  })

  // 5. Construct the dynamic redirect URI based on the current environment
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${baseUrl}/api/auth/shopify/callback`

  // 6. Build the official Shopify install URL
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(nonce)}`

  // 7. Send the merchant to Shopify!
  return NextResponse.redirect(installUrl)
}

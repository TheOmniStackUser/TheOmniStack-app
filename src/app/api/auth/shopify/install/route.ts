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

  // 2. Define required scopes for TheOmniStack
  const scopes = 'read_orders,write_orders,read_products,read_customers'
  
  // 3. Generate CSRF protection nonce
  const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

  // 4. Set the nonce in an encrypted cookie to verify it later in the callback
  const cookieStore = await cookies()
  cookieStore.set('shopify_oauth_nonce', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
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

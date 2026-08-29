import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  
  // Amazon passes these parameters back to our callback
  const spapiOauthCode = searchParams.get('spapi_oauth_code')
  const sellingPartnerId = searchParams.get('selling_partner_id')
  const state = searchParams.get('state') // This contains our companyId
  
  if (!spapiOauthCode || !sellingPartnerId || !state) {
    console.error('Missing parameters from Amazon callback:', { spapiOauthCode: !!spapiOauthCode, sellingPartnerId: !!sellingPartnerId, state: !!state })
    return NextResponse.redirect(new URL('/integrations?status=amazon_error_missing_params', req.url))
  }

  const companyId = state
  const clientId = process.env.AMAZON_CLIENT_ID
  const clientSecret = process.env.AMAZON_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('Missing Amazon Developer Credentials in environment variables.')
    return NextResponse.redirect(new URL('/integrations?status=amazon_error_internal', req.url))
  }

  try {
    // 1. Exchange the spapi_oauth_code for a permanent Refresh Token
    const tokenResponse = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: spapiOauthCode,
        client_id: clientId,
        client_secret: clientSecret
      }).toString()
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      console.error('Failed to exchange Amazon OAuth code:', tokenData)
      return NextResponse.redirect(new URL('/integrations?status=amazon_error_exchange', req.url))
    }

    const refreshToken = tokenData.refresh_token
    const accessToken = tokenData.access_token

    // 2. Save the Refresh Token and Seller ID to our database for this merchant
    const existing = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.type, 'amazon')
        )
      )
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(marketplaceIntegrations)
        .set({
          sellerId: sellingPartnerId,
          refreshToken: refreshToken,
          accessToken: accessToken, // We can store the initial access token too (expires in 1hr)
          expiresAt: new Date(Date.now() + (tokenData.expires_in * 1000)),
          updatedAt: new Date(),
        })
        .where(eq(marketplaceIntegrations.id, existing[0].id))
    } else {
      await db.insert(marketplaceIntegrations).values({
        companyId,
        type: 'amazon',
        sellerId: sellingPartnerId,
        refreshToken: refreshToken,
        accessToken: accessToken,
        expiresAt: new Date(Date.now() + (tokenData.expires_in * 1000)),
        metadata: {},
      })
    }

    // 3. Redirect back to the dashboard integrations page with success
    return NextResponse.redirect(new URL('/integrations?status=amazon_success', req.url))
    
  } catch (error) {
    console.error('Error during Amazon OAuth callback processing:', error)
    return NextResponse.redirect(new URL('/integrations?status=amazon_error_internal', req.url))
  }
}

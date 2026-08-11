import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

const EBAY_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token'
const EBAY_SANDBOX_TOKEN_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state') // This is the companyId
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  if (error) {
    console.error('[eBay OAuth] User denied or error:', error, errorDescription)
    return NextResponse.redirect(new URL('/integrations?status=ebay_error', req.url))
  }

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  const companyId = state

  try {
    const clientId = process.env.EBAY_CLIENT_ID
    const clientSecret = process.env.EBAY_CLIENT_SECRET
    const ruName = process.env.EBAY_RU_NAME || 'F__L_Fashion_Gm-FLFashio-TheOmn-edszszsj'
    const isSandbox = process.env.EBAY_ENVIRONMENT === 'sandbox'

    if (!clientId || !clientSecret) {
      throw new Error('eBay client credentials not configured in environment')
    }

    const tokenUrl = isSandbox ? EBAY_SANDBOX_TOKEN_URL : EBAY_TOKEN_URL

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const body = new URLSearchParams()
    body.append('grant_type', 'authorization_code')
    body.append('code', decodeURIComponent(code))
    body.append('redirect_uri', ruName)

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: body.toString()
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[eBay OAuth] Token exchange failed:', errText)
      throw new Error('Failed to exchange code for token')
    }

    const data = await response.json()
    const now = new Date()

    // 1. Fetch integration to see if it exists
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

    if (integration) {
      await db
        .update(marketplaceIntegrations)
        .set({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: new Date(now.getTime() + data.expires_in * 1000),
          updatedAt: now,
          isActive: true
        })
        .where(eq(marketplaceIntegrations.id, integration.id))
    } else {
      await db
        .insert(marketplaceIntegrations)
        .values({
          companyId,
          type: 'ebay',
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: new Date(now.getTime() + data.expires_in * 1000),
          environment: isSandbox ? 'sandbox' : 'production',
          isActive: true,
          updatedAt: now,
          createdAt: now
        })
    }

    return NextResponse.redirect(new URL('/integrations?status=ebay_success', req.url))
  } catch (err: any) {
    console.error('[eBay OAuth] Callback error:', err)
    return NextResponse.redirect(new URL('/integrations?status=ebay_error', req.url))
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'
import { cookies } from 'next/headers'

const ETSY_CLIENT_ID = 'c5j4zwilbc679dv552svbzbi'
const ETSY_CLIENT_SECRET = 'pp0wbvvv22'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const action = url.searchParams.get('action')

  if (action === 'connect') {
    return handleConnect(request)
  } else if (url.searchParams.has('code')) {
    return handleCallback(request)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

async function handleConnect(request: NextRequest) {
  const url = new URL(request.url)
  const companyId = url.searchParams.get('companyId')

  if (!companyId) {
    return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
  }

  // Generate PKCE code verifier and challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
  
  // Generate random state
  const state = crypto.randomBytes(16).toString('hex')

  // Store codeVerifier, state, and companyId in a short-lived cookie
  const cookieStore = await cookies()
  cookieStore.set('etsy_oauth_state', JSON.stringify({ codeVerifier, state, companyId }), {
    path: '/',
    maxAge: 3600, // 1 hour
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  const redirectUri = `${url.origin}/api/auth/etsy`
  const scope = 'transactions_r transactions_w listings_r listings_w profile_r'

  const authUrl = new URL('https://www.etsy.com/oauth/connect')
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', scope)
  authUrl.searchParams.set('client_id', ETSY_CLIENT_ID)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  return NextResponse.redirect(authUrl.toString())
}

async function handleCallback(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error || !code) {
    console.error('[Etsy Auth] OAuth error:', error)
    return NextResponse.redirect(new URL('/integrations?status=etsy_error', request.url))
  }

  const cookieStore = await cookies()
  const cookieDataStr = cookieStore.get('etsy_oauth_state')?.value
  
  if (!cookieDataStr) {
    console.error('[Etsy Auth] Missing OAuth state cookie')
    return NextResponse.redirect(new URL('/integrations?status=etsy_error_no_cookie', request.url))
  }

  const { codeVerifier, state, companyId } = JSON.parse(cookieDataStr)

  if (returnedState !== state) {
    console.error('[Etsy Auth] State mismatch')
    return NextResponse.redirect(new URL('/integrations?status=etsy_error_state_mismatch', request.url))
  }

  let [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, companyId),
        eq(marketplaceIntegrations.type, 'etsy')
      )
    )
    .limit(1)

  const redirectUri = `${url.origin}/api/auth/etsy`
  
  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: ETSY_CLIENT_ID,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  })

  const tokenRes = await fetch('https://api.etsy.com/v3/public/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: tokenBody.toString()
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text()
    console.error('[Etsy Auth] Token exchange failed:', tokenRes.status, errText)
    return NextResponse.redirect(new URL('/integrations?status=etsy_error_token_exchange', request.url))
  }

  const tokenData = await tokenRes.json()

  // Save tokens to DB
  if (integration) {
    await db
      .update(marketplaceIntegrations)
      .set({
        clientId: ETSY_CLIENT_ID,
        clientSecret: ETSY_CLIENT_SECRET,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        updatedAt: new Date()
      })
      .where(eq(marketplaceIntegrations.id, integration.id))
  } else {
    await db
      .insert(marketplaceIntegrations)
      .values({
        companyId,
        type: 'etsy',
        clientId: ETSY_CLIENT_ID,
        clientSecret: ETSY_CLIENT_SECRET,
        environment: 'production',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      })
  }

  // Clean up cookie
  cookieStore.delete('etsy_oauth_state')

  return NextResponse.redirect(new URL('/integrations?status=etsy_success', request.url))
}

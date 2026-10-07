import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/settings?error=${error}`, req.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/settings?error=missing_code_or_state', req.url))
  }

  let companyId: string
  try {
    const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'))
    companyId = decodedState.companyId
  } catch (e) {
    return NextResponse.redirect(new URL('/settings?error=invalid_state', req.url))
  }

  const clientId = process.env.LEXOFFICE_CLIENT_ID
  const clientSecret = process.env.LEXOFFICE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/settings?error=lexoffice_not_configured', req.url))
  }

  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const host = req.headers.get('host') || 'localhost:3000'
  const redirectUri = `${protocol}://${host}/api/auth/lexoffice/callback`

  try {
    const tokenParams = new URLSearchParams()
    tokenParams.append('grant_type', 'authorization_code')
    tokenParams.append('code', code)
    tokenParams.append('redirect_uri', redirectUri)
    tokenParams.append('client_id', clientId)
    
    // Lexoffice expects basic auth for client_id/client_secret
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const tokenRes = await fetch('https://app.lexoffice.de/auth/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'application/json'
      },
      body: tokenParams.toString()
    })

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text()
      console.error('Lexoffice Token Error:', errorText)
      return NextResponse.redirect(new URL(`/settings?error=lexoffice_auth_failed`, req.url))
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in } = tokenData

    const expiresAt = new Date(Date.now() + (expires_in * 1000))

    await db.update(companies)
      .set({
        lexofficeApiKey: access_token, // Overwrite the key with the new access token
        lexofficeRefreshToken: refresh_token,
        lexofficeExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId))

    return NextResponse.redirect(new URL('/settings?success=lexoffice_connected', req.url))
  } catch (err: any) {
    console.error('Failed to handle Lexoffice callback:', err)
    return NextResponse.redirect(new URL('/settings?error=internal_error', req.url))
  }
}

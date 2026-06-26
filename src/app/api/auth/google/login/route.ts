import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  
  if (!clientId) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID is missing' }, { status: 500 })
  }

  // Generate a random state string for CSRF protection
  const state = crypto.randomBytes(32).toString('hex')
  
  // Get base URL for redirect URI
  const url = new URL(request.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const redirectUri = `${baseUrl}/api/auth/callback/google`

  // Build the Google OAuth URL
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  googleAuthUrl.searchParams.set('client_id', clientId)
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri)
  googleAuthUrl.searchParams.set('response_type', 'code')
  googleAuthUrl.searchParams.set('scope', 'openid email profile')
  googleAuthUrl.searchParams.set('state', state)
  googleAuthUrl.searchParams.set('access_type', 'online')
  googleAuthUrl.searchParams.set('prompt', 'select_account')

  // Create the response and set the state cookie
  const response = NextResponse.redirect(googleAuthUrl.toString())
  
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10 // 10 minutes
  })

  return response
}

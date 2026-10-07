import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || !session.activeCompanyId) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const clientId = process.env.LEXOFFICE_CLIENT_ID
  if (!clientId) {
    return new NextResponse('LEXOFFICE_CLIENT_ID not configured', { status: 500 })
  }

  // Construct the redirect URI
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const host = req.headers.get('host') || 'localhost:3000'
  const redirectUri = `${protocol}://${host}/api/auth/lexoffice/callback`

  // Generate a state parameter containing the companyId for security/context
  const state = Buffer.from(JSON.stringify({ companyId: session.activeCompanyId })).toString('base64')

  const authUrl = new URL('https://app.lexoffice.de/auth/oauth2/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('state', state)

  return NextResponse.redirect(authUrl.toString())
}

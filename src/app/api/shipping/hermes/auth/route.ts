import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth()
    
    // Diese Daten kommen von Hermes, sobald wir als Software-Partner registriert sind
    const HERMES_CLIENT_ID = process.env.HERMES_PARTNER_CLIENT_ID || 'PENDING'
    const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/shipping/hermes/callback`
    
    const hermesAuthUrl = new URL('https://authme.myhermes.de/authorization-facade/oauth2/authorize')
    hermesAuthUrl.searchParams.append('response_type', 'code')
    hermesAuthUrl.searchParams.append('client_id', HERMES_CLIENT_ID)
    hermesAuthUrl.searchParams.append('redirect_uri', REDIRECT_URI)
    hermesAuthUrl.searchParams.append('scope', 'shipments labels') // Beispiel Scopes
    hermesAuthUrl.searchParams.append('state', auth.activeCompanyId) // Wir nutzen state, um die Company ID zu tracken

    return NextResponse.redirect(hermesAuthUrl.toString())
  } catch (error) {
    console.error('Hermes Auth Start Error:', error)
    return NextResponse.json({ error: 'Auth konnte nicht gestartet werden' }, { status: 500 })
  }
}

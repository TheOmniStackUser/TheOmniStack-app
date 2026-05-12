import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const companyId = searchParams.get('state') // Wir haben die Company ID im state mitgegeben

  if (!code || !companyId) {
    return NextResponse.json({ error: 'Ungültiger Callback von Hermes' }, { status: 400 })
  }

  try {
    const HERMES_CLIENT_ID = process.env.HERMES_PARTNER_CLIENT_ID || 'PENDING'
    const HERMES_CLIENT_SECRET = process.env.HERMES_PARTNER_CLIENT_SECRET || 'PENDING'
    const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/shipping/hermes/callback`

    // Tausche den Code gegen Tokens
    const tokenResponse = await fetch('https://authme.myhermes.de/authorization-facade/oauth2/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        client_id: HERMES_CLIENT_ID,
        client_secret: HERMES_CLIENT_SECRET
      })
    })

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text()
      throw new Error(`Token Exchange failed: ${errText}`)
    }

    const tokens = await tokenResponse.json()

    // Speichere die Tokens in der Datenbank
    const expiresAt = new Date()
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in)

    // Prüfe ob Integration existiert
    const [existing] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, companyId),
          eq(marketplaceIntegrations.type, 'hermes')
        )
      )
      .limit(1)

    if (existing) {
      await db
        .update(marketplaceIntegrations)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: expiresAt,
          updatedAt: new Date()
        })
        .where(eq(marketplaceIntegrations.id, existing.id))
    } else {
      await db
        .insert(marketplaceIntegrations)
        .values({
          companyId,
          type: 'hermes',
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: expiresAt,
          isActive: true
        })
    }

    // Zurück zur Integrations-Seite
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?status=hermes_success`)
  } catch (error) {
    console.error('Hermes Callback Error:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?status=hermes_error`)
  }
}

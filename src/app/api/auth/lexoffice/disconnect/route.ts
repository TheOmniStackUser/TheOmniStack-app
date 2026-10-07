import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.activeCompanyId) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    await db.update(companies)
      .set({
        lexofficeApiKey: null,
        lexofficeRefreshToken: null,
        lexofficeExpiresAt: null,
        lexofficeAutoExport: false,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, session.activeCompanyId))

    return NextResponse.redirect(new URL('/settings?success=lexoffice_disconnected', req.url))
  } catch (err: any) {
    console.error('Failed to disconnect Lexoffice:', err)
    return NextResponse.redirect(new URL('/settings?error=disconnect_failed', req.url))
  }
}

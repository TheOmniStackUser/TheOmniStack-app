import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { lexofficeAutoExport } = body

    await db.update(companies)
      .set({
        lexofficeAutoExport: lexofficeAutoExport === true,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, session.activeCompanyId))

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating Lexoffice settings:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

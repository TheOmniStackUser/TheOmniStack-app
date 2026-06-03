import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { sql } from 'drizzle-orm'

export async function GET() {
  try {
    await db.execute(sql`
      ALTER TABLE company_members ADD COLUMN IF NOT EXISTS api_key text UNIQUE;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS api_key text UNIQUE;
    `)
    return NextResponse.json({ success: true, message: 'Migration executed successfully' })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

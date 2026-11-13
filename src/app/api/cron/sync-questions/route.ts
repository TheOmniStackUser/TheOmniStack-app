import { NextResponse } from 'next/server'
import { syncAllCompaniesQuestions } from '@/lib/sync-questions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      if (!process.env.ADMIN_SECRET || authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
        if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
      }
    }

    const result = await syncAllCompaniesQuestions()

    return NextResponse.json({
      success: true,
      message: `Questions auto-sync completed: ${result.totalSynced} new inquiries across ${result.companiesProcessed} companies.`,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[Cron sync-questions] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return GET(req)
}

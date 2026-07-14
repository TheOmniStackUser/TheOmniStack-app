import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getProductSyncQueue } from '@/workers/product-sync'

export const maxDuration = 60

export async function POST() {
  try {
    const session = await getSession()
    if (!session || !session.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const job = await getProductSyncQueue().add(
      `push-sync-${session.activeCompanyId}-${Date.now()}`,
      {
        companyId: session.activeCompanyId,
        action: 'push_all'
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
      }
    )

    return NextResponse.json({ success: true, message: 'Sync wurde im Hintergrund gestartet.', jobId: job.id })
  } catch (error: any) {
    console.error('[GlobalSync] Error:', error)
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 })
  }
}

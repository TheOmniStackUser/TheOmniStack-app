import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getProductSyncQueue } from '@/workers/product-sync'

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session || !session.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 })
    }

    const queue = getProductSyncQueue()
    const job = await queue.getJob(jobId)

    if (!job) {
      return NextResponse.json({ error: 'Job not found or already completed' }, { status: 404 })
    }

    const state = await job.getState()
    const progress = job.progress || 0
    const result = job.returnvalue

    return NextResponse.json({
      success: true,
      state,
      progress,
      result
    })
  } catch (error: any) {
    console.error('[GlobalSyncStatus] Error:', error)
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 })
  }
}

import { requireAuth } from '@/lib/session'
import { getPerformanceAnalytics } from '@/app/actions/performance'
import { PerformanceClient } from './performance-client'

export const metadata = {
  title: 'Performance - TheOmniStack',
}

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export default async function PerformancePage() {
  await requireAuth()

  // Fetch default 30 days overall performance data
  const initialData = await getPerformanceAnalytics({
    timeRange: '30d',
    marketplace: 'all',
  })

  return <PerformanceClient initialData={initialData} />
}

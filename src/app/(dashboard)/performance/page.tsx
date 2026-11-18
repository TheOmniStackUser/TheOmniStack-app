import { requireAuth } from '@/lib/session'
import { getPerformanceAnalytics } from '@/app/actions/performance'
import type { TimeRangePreset } from './types'
import { PerformanceClient } from './performance-client'

export const metadata = {
  title: 'Performance - TheOmniStack',
}

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const VALID_PRESETS: Set<TimeRangePreset> = new Set([
  'today',
  '7d',
  '30d',
  'this_month',
  'last_month',
  '90d',
  'this_year',
  '365d',
  'all_time',
  'custom',
])

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; timeRange?: string }>
}) {
  await requireAuth()
  const resolvedSearchParams = await searchParams

  const presetParam = resolvedSearchParams.timeRange as TimeRangePreset | undefined
  const timeRange: TimeRangePreset =
    presetParam && VALID_PRESETS.has(presetParam) ? presetParam : '30d'

  const initialTab =
    resolvedSearchParams.tab === 'marketplaces' || resolvedSearchParams.tab === 'products'
      ? resolvedSearchParams.tab
      : 'overview'

  // Fetch default 30 days overall performance data
  const initialData = await getPerformanceAnalytics({
    timeRange,
    marketplace: 'all',
  })

  return <PerformanceClient initialData={initialData} initialTab={initialTab} />
}

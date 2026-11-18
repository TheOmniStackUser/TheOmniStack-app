import { requireAuth } from '@/lib/session'
import { getPerformanceAnalytics } from '@/app/actions/performance'
import type { TimeRangePreset } from '../../types'
import { MarketplaceDetailClient } from './marketplace-detail-client'

export const metadata = {
  title: 'Marktplatz Performance & Vergleich - TheOmniStack',
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

export default async function MarketplacePerformanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ marketplace: string }>
  searchParams: Promise<{
    timeRange?: string
    from?: string
    to?: string
    compareFrom?: string
    compareTo?: string
  }>
}) {
  await requireAuth()

  const { marketplace } = await params
  const resolvedSearchParams = await searchParams
  const decodedMarketplace = decodeURIComponent(marketplace)

  const presetParam = resolvedSearchParams.timeRange as TimeRangePreset | undefined
  const timeRange: TimeRangePreset =
    presetParam && VALID_PRESETS.has(presetParam) ? presetParam : '30d'

  const initialData = await getPerformanceAnalytics({
    timeRange,
    marketplace: decodedMarketplace,
    customFrom: resolvedSearchParams.from,
    customTo: resolvedSearchParams.to,
    compareFrom: resolvedSearchParams.compareFrom,
    compareTo: resolvedSearchParams.compareTo,
  })

  return (
    <MarketplaceDetailClient
      initialData={initialData}
      marketplaceId={decodedMarketplace}
      initialCompareFrom={resolvedSearchParams.compareFrom}
      initialCompareTo={resolvedSearchParams.compareTo}
    />
  )
}

import React from 'react'
import { SkeletonPulse, ToolbarSkeleton, TableSkeleton } from '@/components/skeleton'

export default function QuotesLoading() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="space-y-3">
          <SkeletonPulse className="h-8 w-36" />
          <SkeletonPulse className="h-4 w-96" />
        </div>
        <SkeletonPulse className="h-11 w-36 bg-gradient-to-r from-amber-200 to-amber-300 rounded-xl animate-pulse" />
      </div>

      {/* Info Banner Placeholder */}
      <div className="mb-6 p-4 bg-amber-50/50 border border-amber-100 rounded-xl flex gap-3 h-16 items-center">
        <SkeletonPulse className="h-5 w-5 rounded-full bg-amber-200" />
        <SkeletonPulse className="h-4 w-5/6 bg-amber-100" />
      </div>

      <ToolbarSkeleton />
      <TableSkeleton rows={8} cols={6} />
    </div>
  )
}

import React from 'react'
import { SkeletonPulse, ToolbarSkeleton, TableSkeleton } from '@/components/skeleton'

export default function InvoicesLoading() {
  return (
    <div className="p-8">
      {/* Header with multiple buttons */}
      <div className="flex justify-between items-center mb-8">
        <div className="space-y-3">
          <SkeletonPulse className="h-8 w-44" />
          <SkeletonPulse className="h-4 w-96" />
        </div>
        <div className="flex gap-3">
          <SkeletonPulse className="h-10 w-36 rounded-xl" />
          <SkeletonPulse className="h-10 w-28 rounded-xl" />
          <SkeletonPulse className="h-10 w-48 rounded-xl" />
        </div>
      </div>

      <ToolbarSkeleton />
      <TableSkeleton rows={8} cols={7} />
    </div>
  )
}

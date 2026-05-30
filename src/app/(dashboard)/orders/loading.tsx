import React from 'react'
import { HeaderSkeleton, SkeletonPulse, ToolbarSkeleton, TableSkeleton } from '@/components/skeleton'

export default function OrdersLoading() {
  return (
    <div className="max-w-[1600px] mx-auto">
      <HeaderSkeleton titleWidth="w-48" subtitleWidth="w-80" hasButton={false} />
      
      {/* Manual Import Box Placeholder */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/60 shadow-sm mb-6 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="space-y-2">
          <SkeletonPulse className="h-5 w-44" />
          <SkeletonPulse className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <SkeletonPulse className="h-10 w-32 rounded-xl" />
          <SkeletonPulse className="h-10 w-32 rounded-xl" />
        </div>
      </div>

      <ToolbarSkeleton />
      <TableSkeleton rows={8} cols={7} />
    </div>
  )
}

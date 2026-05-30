import React from 'react'
import { HeaderSkeleton, ToolbarSkeleton, TableSkeleton } from '@/components/skeleton'

export default function ReturnsLoading() {
  return (
    <div className="space-y-8">
      <HeaderSkeleton titleWidth="w-56" subtitleWidth="w-96" hasButton={false} />
      <ToolbarSkeleton />
      <TableSkeleton rows={8} cols={6} />
    </div>
  )
}

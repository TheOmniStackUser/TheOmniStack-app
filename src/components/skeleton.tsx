import React from 'react'

export function SkeletonPulse({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-slate-200 rounded-lg ${className}`} />
  )
}

export function HeaderSkeleton({
  titleWidth = 'w-48',
  subtitleWidth = 'w-96',
  hasButton = true,
  buttonWidth = 'w-36'
}) {
  return (
    <div className="flex justify-between items-start mb-8">
      <div className="space-y-3">
        <SkeletonPulse className={`h-8 ${titleWidth}`} />
        <SkeletonPulse className={`h-4 ${subtitleWidth}`} />
      </div>
      {hasButton && <SkeletonPulse className={`h-10 ${buttonWidth} rounded-xl`} />}
    </div>
  )
}

export function CardGridSkeleton({ count = 5 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="bg-white p-6 rounded-xl border border-slate-200/60 shadow-sm space-y-4 flex flex-col justify-between h-32">
          <div className="space-y-2">
            <SkeletonPulse className="h-4 w-28" />
            <SkeletonPulse className="h-8 w-16" />
          </div>
          <SkeletonPulse className="h-3 w-36" />
        </div>
      ))}
    </div>
  )
}

export function ToolbarSkeleton() {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200/60 flex items-center justify-between gap-4 mb-6 shadow-sm">
      <div className="flex gap-3 flex-1">
        <SkeletonPulse className="h-10 w-64 rounded-xl" />
        <SkeletonPulse className="h-10 w-32 rounded-xl" />
        <SkeletonPulse className="h-10 w-32 rounded-xl" />
      </div>
      <SkeletonPulse className="h-10 w-24 rounded-xl" />
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 6 }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden shadow-sm">
      {/* Table Header */}
      <div className="border-b border-slate-200/60 bg-slate-50/50 px-6 py-4 flex justify-between items-center gap-4">
        {[...Array(cols)].map((_, i) => {
          let width = 'w-24'
          if (i === 0) width = 'w-12'
          else if (i === 1) width = 'w-32'
          else if (i === 2) width = 'w-48'
          return <SkeletonPulse key={i} className={`h-4 ${width}`} />
        })}
      </div>
      {/* Table Rows */}
      <div className="divide-y divide-slate-100">
        {[...Array(rows)].map((_, rowIndex) => (
          <div key={rowIndex} className="px-6 py-5 flex justify-between items-center gap-4">
            {[...Array(cols)].map((_, colIndex) => {
              let width = 'w-24'
              if (colIndex === 0) width = 'w-12'
              else if (colIndex === 1) width = 'w-32'
              else if (colIndex === 2) width = 'w-48'
              return <SkeletonPulse key={colIndex} className={`h-4 ${width} bg-slate-100`} />
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

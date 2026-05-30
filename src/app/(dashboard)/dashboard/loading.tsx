import React from 'react'
import { HeaderSkeleton, SkeletonPulse } from '@/components/skeleton'

export default function DashboardLoading() {
  return (
    <div className="max-w-6xl mx-auto space-y-12">
      <HeaderSkeleton titleWidth="w-56" subtitleWidth="w-72" buttonWidth="w-44" />
      
      {/* Current Month & Active Section */}
      <section className="space-y-6">
        <SkeletonPulse className="h-4 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-xl border border-slate-200/60 shadow-sm h-32 flex flex-col justify-between">
              <div className="space-y-2">
                <SkeletonPulse className="h-4 w-28" />
                <SkeletonPulse className="h-8 w-16" />
              </div>
              <SkeletonPulse className="h-3 w-36" />
            </div>
          ))}
        </div>
      </section>

      {/* Lifetime / Overall Section */}
      <section className="space-y-6">
        <SkeletonPulse className="h-4 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-xl border border-slate-200/60 shadow-sm h-36 flex flex-col justify-between">
              <div className="space-y-2">
                <SkeletonPulse className="h-4 w-36" />
                <SkeletonPulse className="h-8 w-20" />
              </div>
              <SkeletonPulse className="h-3 w-44" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

'use client'

import React from 'react'

export interface StatusBarProps {
  data: (1 | 0 | null)[] // 1 = up, 0 = down, null = no data/white
  days: number // usually 90
}

export function StatusBar({ data, days = 90 }: StatusBarProps) {
  // Pad or trim data to exactly `days` length
  const displayData = [...data]
  if (displayData.length < days) {
    const missing = days - displayData.length
    for (let i = 0; i < missing; i++) {
      displayData.push(null)
    }
  } else if (displayData.length > days) {
    displayData.splice(0, displayData.length - days)
  }

  return (
    <div className="flex gap-0.5 items-end h-8 w-full">
      {displayData.map((status, index) => {
        let bgColor = 'bg-slate-200 dark:bg-slate-700/50' // default white/gray for no data
        if (status === 1) {
          bgColor = 'bg-emerald-400'
        } else if (status === 0) {
          bgColor = 'bg-rose-500'
        }

        // Add a tooltip for hover maybe? We can just use title attribute for simplicity
        const dateStr = new Date(Date.now() - (days - 1 - index) * 24 * 60 * 60 * 1000).toLocaleDateString('de-DE')
        let statusText = 'Keine Daten'
        if (status === 1) statusText = 'Verfügbar'
        if (status === 0) statusText = 'Ausfall'

        return (
          <div
            key={index}
            className={`flex-1 rounded-sm min-w-[2px] transition-all hover:opacity-80 ${bgColor}`}
            style={{ height: status === null ? '40%' : '100%' }} // Shorter bar if no data
            title={`${dateStr}: ${statusText}`}
          />
        )
      })}
    </div>
  )
}

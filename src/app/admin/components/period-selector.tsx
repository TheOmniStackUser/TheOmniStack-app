'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export function PeriodSelector() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentPeriod = searchParams.get('period') || 'current_month'

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPeriod = e.target.value
    const params = new URLSearchParams(searchParams.toString())
    if (newPeriod === 'current_month') {
      params.delete('period')
    } else {
      params.set('period', newPeriod)
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <select
      value={currentPeriod}
      onChange={handleChange}
      className="bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-violet-500 focus:border-violet-500 block px-3 py-1.5 outline-none font-medium shadow-sm"
    >
      <option value="current_month" className="text-slate-900 bg-white">Aktueller Monat</option>
      <option value="last_month" className="text-slate-900 bg-white">Vormonat</option>
      <option value="current_year" className="text-slate-900 bg-white">Aktuelles Jahr</option>
      <option value="last_year" className="text-slate-900 bg-white">Vorjahr</option>
      <option value="all_time" className="text-slate-900 bg-white">Gesamter Zeitraum</option>
    </select>
  )
}

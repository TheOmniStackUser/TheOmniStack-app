'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Package, ClipboardList, Layers, Settings, History } from 'lucide-react'

const NAV_ITEMS = [
  {
    href: '/products',
    label: 'Alle Produkte',
    icon: Package,
    exact: true,
  },
  {
    href: '/products/inventory',
    label: 'Laufende Inventur',
    icon: ClipboardList,
    exact: false,
  },
  {
    href: '/products/import',
    label: 'Marketplace Import',
    icon: Layers,
    exact: false,
  },
  {
    href: '/products/settings',
    label: 'Einstellungen',
    icon: Settings,
    exact: false,
  },
  {
    href: '/products/logs',
    label: 'Sync-Logs',
    icon: History,
    exact: false,
  },
]

export function ProductsSubNav() {
  const pathname = usePathname()

  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/80 w-fit">
      {NAV_ITEMS.map(item => {
        const Icon = item.icon
        const isActive = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname?.startsWith(`${item.href}/`)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              isActive
                ? 'bg-white text-cyan-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-600' : 'text-slate-400'}`} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </div>
  )
}

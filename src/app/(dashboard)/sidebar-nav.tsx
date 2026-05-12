'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function SidebarNav() {
  const pathname = usePathname()

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/orders', label: 'Bestellungen' },
    { href: '/invoices', label: 'Rechnungen' },
  ]

  return (
    <nav className="flex-1 px-4 space-y-2 mt-4">
      {links.map((link) => {
        const isActive = pathname === link.href || pathname?.startsWith(`${link.href}/`)
        
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`block px-4 py-2 rounded-md transition-colors ${
              isActive 
                ? 'bg-blue-600 text-white' 
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
      

    </nav>
  )
}

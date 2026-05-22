'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function SidebarNav({ role }: { role: string }) {
  const pathname = usePathname()

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/orders', label: 'Bestellungen' },
    { href: '/invoices', label: 'Rechnungen' },
    { href: '/quotes', label: 'Angebote' },
  ]

  // Beta features (Returns) positioned under Invoices for specific roles
  const canSeeReturns = role === 'omnistack_support' || role === 'omnistack_beta' || role === 'owner'

  return (
    <nav className="flex-1 px-4 space-y-1 mt-4">
      <div className="mb-2 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em]">
        Operativ
      </div>
      {links.map((link) => {
        const isActive = pathname === link.href || pathname?.startsWith(`${link.href}/`)
        
        return (
          <div key={link.href}>
            <Link
              href={link.href}
              className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                isActive 
                  ? 'bg-cyan-500/10 text-cyan-400 shadow-[inset_0_0_10px_rgba(34,211,238,0.1)]' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full mr-3 transition-all ${isActive ? 'bg-cyan-400' : 'bg-transparent'}`} />
              {link.label}
            </Link>

            {/* Nest Returns under Quotes if applicable */}
            {link.href === '/quotes' && canSeeReturns && (
              <Link
                href="/returns"
                className={`flex items-center px-4 py-2 mt-1 ml-4 text-xs font-medium rounded-lg transition-all duration-200 ${
                  pathname?.startsWith('/returns')
                    ? 'text-cyan-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <div className="w-1 h-1 rounded-full bg-slate-600 mr-3" />
                Retouren (Beta)
              </Link>
            )}
          </div>
        )
      })}
    </nav>
  )
}

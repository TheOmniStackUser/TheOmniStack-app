'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function SidebarNav({ 
  role,
  features = { returns: false, products: false }
}: { 
  role: string
  features?: { returns: boolean; products: boolean }
}) {
  const pathname = usePathname()

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/orders', label: 'Bestellungen' },
    { href: '/invoices', label: 'Rechnungen' },
    { href: '/delivery-notes', label: 'Lieferscheine' },
    { href: '/quotes', label: 'Angebote' },
    { href: '/customers', label: 'Kunden' },
  ]

  if (features.returns) {
    links.push({ href: '/returns', label: 'Retouren' })
  }
  
  if (features.products) {
    links.push({ href: '/products', label: 'Produkte' })
  }


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
              prefetch={true}
              className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                isActive 
                  ? 'bg-cyan-500/10 text-cyan-400 shadow-[inset_0_0_10px_rgba(34,211,238,0.1)]' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full mr-3 transition-all ${isActive ? 'bg-cyan-400' : 'bg-transparent'}`} />
              {link.label}
            </Link>
          </div>
        )
      })}
    </nav>
  )
}

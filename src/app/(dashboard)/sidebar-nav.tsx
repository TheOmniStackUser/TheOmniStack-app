'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, 
  ShoppingCart, 
  FileText, 
  Package, 
  FileSignature, 
  Users, 
  RotateCcw, 
  Box 
} from 'lucide-react'

export function SidebarNav({ 
  role,
  features = { returns: false, products: false }
}: { 
  role: string
  features?: { returns: boolean; products: boolean }
}) {
  const pathname = usePathname()

  const isCraftVariant = process.env.NEXT_PUBLIC_APP_VARIANT === 'craft'

  let links = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/orders', label: 'Bestellungen', icon: ShoppingCart },
    { href: '/invoices', label: 'Rechnungen', icon: FileText },
    { href: '/delivery-notes', label: 'Lieferscheine', icon: Package },
    { href: '/quotes', label: 'Angebote', icon: FileSignature },
    { href: '/customers', label: 'Kunden', icon: Users },
  ]

  if (features.returns) {
    links.push({ href: '/returns', label: 'Retouren', icon: RotateCcw })
  }
  
  if (features.products) {
    links.push({ href: '/products', label: 'Produkte', icon: Box })
  }

  if (isCraftVariant) {
    links = links.filter(link => !['/orders', '/returns', '/products'].includes(link.href))
  }

  return (
    <nav className="flex-1 px-4 group-[.collapsed]/sidebar:px-2 space-y-1 mt-4 transition-all">
      <div className="mb-2 px-4 group-[.collapsed]/sidebar:px-0 group-[.collapsed]/sidebar:text-center text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em] transition-all">
        <span className="group-[.collapsed]/sidebar:hidden">Operativ</span>
        <span className="hidden group-[.collapsed]/sidebar:block text-[10px]">Op</span>
      </div>
      {links.map((link) => {
        const isActive = pathname === link.href || pathname?.startsWith(`${link.href}/`)
        const Icon = link.icon
        
        return (
          <div key={link.href} title={link.label}>
            <Link
              href={link.href}
              prefetch={true}
              className={`flex items-center px-4 py-2.5 group-[.collapsed]/sidebar:px-0 group-[.collapsed]/sidebar:justify-center text-sm font-medium rounded-xl transition-all duration-200 ${
                isActive 
                  ? 'bg-cyan-500/10 text-cyan-400 shadow-[inset_0_0_10px_rgba(34,211,238,0.1)]' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="relative flex items-center justify-center mr-3 group-[.collapsed]/sidebar:mr-0 transition-all">
                <Icon size={18} className={`${isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-white'} transition-colors`} />
                {/* Active indicator dot for collapsed mode */}
                {isActive && (
                  <div className="absolute -right-1 -bottom-1 w-2 h-2 rounded-full bg-cyan-400 hidden group-[.collapsed]/sidebar:block" />
                )}
              </div>
              <span className="group-[.collapsed]/sidebar:hidden whitespace-nowrap">{link.label}</span>
            </Link>
          </div>
        )
      })}
    </nav>
  )
}

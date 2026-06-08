import { requireAuth } from '@/lib/session'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { logoutAction } from '@/app/actions/auth'
import { SidebarNav } from './sidebar-nav'
import { db } from '@/db/client'
import { users } from '@/db/schema/auth'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'
import { AutoRefresh } from '@/components/auto-refresh'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const auth = await requireAuth()

  const [user] = await db
    .select({ 
      email: users.email,
      isSuperAdmin: users.isSuperAdmin,
      twoFactorEnabled: users.twoFactorEnabled 
    })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1)

  const [company] = await db
    .select({
      featuresReturnsEnabled: companies.featuresReturnsEnabled,
      featuresProductsEnabled: companies.featuresProductsEnabled,
    })
    .from(companies)
    .where(eq(companies.id, auth.activeCompanyId))
    .limit(1)

  const { headers } = await import('next/headers')
  const hdrs = await headers()
  const pathname = (hdrs.get('x-pathname') || '').split('?')[0]
  
  // Mandatory 2FA Check - Redirect to setup if not enabled (Bypass for Shopify/Apple Reviewers)
  const isTestAccount = user?.email === 'shopify-test@theomnistack.de' || user?.email === 'apple-test@theomnistack.de'
  if (user && !user.twoFactorEnabled && !isTestAccount && !pathname.startsWith('/settings') && !pathname.startsWith('/setup-2fa')) {
    redirect('/setup-2fa')
  }

  // Permission Checks
  const isStaff = auth.role === 'staff'
  const isSupport = auth.role === 'omnistack_support'
  const isBetaSupport = auth.role === 'omnistack_beta'
  const canManage = auth.role === 'owner' || auth.role === 'admin' || isSupport || isBetaSupport

  return (
    <div className="h-screen bg-[#F8FAFC] flex overflow-hidden font-sans">
      <aside className="w-64 bg-[#0F172A] text-slate-300 flex flex-col flex-shrink-0 overflow-y-auto border-r border-slate-800/50 shadow-xl">
        <div className="p-8">
          <Link href="/dashboard" className="flex items-center gap-3 group transition-all duration-300">
            <div className="relative w-8 h-8 rounded-lg overflow-hidden shadow-[0_0_15px_rgba(34,211,238,0.3)] group-hover:shadow-[0_0_20px_rgba(34,211,238,0.5)] transition-shadow">
              <img 
                src="/icon.png" 
                alt="TheOmniStack Logo" 
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight flex items-center leading-none">
              <span className="text-white">The</span>
              <span className="text-cyan-400">Omni</span>
              <span className="text-white">Stack</span>
            </h1>
          </Link>
        </div>
        <div className="flex-1">
          <SidebarNav 
            role={auth.role} 
            features={{
              returns: company?.featuresReturnsEnabled ?? false,
              products: company?.featuresProductsEnabled ?? false
            }}
          />
        </div>
        <div className="p-6 pb-10 border-t border-slate-800/50 mt-auto bg-[#0F172A]/50">
          <div className="mb-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em]">
            Account & System
          </div>
          <nav className="space-y-1 px-2">
            {!isStaff && (
              <>
                <Link href="/settings" className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                  Einstellungen
                </Link>
                <Link href="/integrations" className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                  Integrationen
                </Link>
              </>
            )}

            <Link href="/mobile-app" className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
              Mobile App & API
            </Link>
            
            <Link href="/settings/users" className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
              {canManage ? 'Team-Verwaltung' : 'Mein Profil'}
            </Link>

            <a 
              href="/api/help" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
            >
              Hilfe
            </a>

            {(user?.isSuperAdmin || isSupport) && (
              <Link href="/admin" className="flex items-center px-3 py-2 text-sm font-bold rounded-lg text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/5 transition-all mt-4 border-t border-slate-800/50 pt-4">
                Admin Panel →
              </Link>
            )}

            <form action={logoutAction} className="pt-2">
              <button type="submit" className="w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-400/5 transition-all">
                Abmelden
              </button>
            </form>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto overflow-x-auto">
        <AutoRefresh />
        {children}
      </main>
    </div>
  )
}

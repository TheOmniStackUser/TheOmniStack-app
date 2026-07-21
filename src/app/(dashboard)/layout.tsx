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
import { SidebarProvider } from './sidebar-context'
import { SidebarWrapper, MobileHeader } from './sidebar-wrapper'
import { Settings, Blocks, Smartphone, Users as UsersIcon, LifeBuoy, ShieldAlert, LogOut } from 'lucide-react'

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

  const isCraftVariant = process.env.NEXT_PUBLIC_APP_VARIANT === 'craft'

  return (
    <SidebarProvider>
      <div className="h-screen bg-[#F8FAFC] flex overflow-hidden font-sans w-full">
        <SidebarWrapper>
          <div className="p-8 group-[.collapsed]/sidebar:p-4 group-[.collapsed]/sidebar:pt-8 transition-all">
            <Link href="/dashboard" className="flex items-center gap-3 group transition-all duration-300 group-[.collapsed]/sidebar:justify-center">
              <div className="relative w-8 h-8 rounded-lg overflow-hidden shadow-[0_0_15px_rgba(34,211,238,0.3)] group-hover:shadow-[0_0_20px_rgba(34,211,238,0.5)] transition-shadow flex-shrink-0">
                <img 
                  src="/icon.png" 
                  alt="TheOmniStack Logo" 
                  className="w-full h-full object-cover"
                />
              </div>
              <h1 className="text-xl font-extrabold tracking-tight flex items-center leading-none group-[.collapsed]/sidebar:hidden">
                {isCraftVariant ? (
                  <>
                    <span className="text-white">Profi</span>
                    <span className="text-cyan-400">Faktura</span>
                  </>
                ) : (
                  <>
                    <span className="text-white">The</span>
                    <span className="text-cyan-400">Omni</span>
                    <span className="text-white">Stack</span>
                  </>
                )}
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
          <div className="p-6 pb-10 border-t border-slate-800/50 mt-auto bg-[#0F172A]/50 group-[.collapsed]/sidebar:p-2 group-[.collapsed]/sidebar:pb-6 transition-all">
            <div className="mb-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em] group-[.collapsed]/sidebar:hidden">
              Account & System
            </div>
            <div className="mb-4 px-0 text-center text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em] hidden group-[.collapsed]/sidebar:block">
              Sys
            </div>
            <nav className="space-y-1 px-2 group-[.collapsed]/sidebar:px-0">
              {!isStaff && (
                <>
                  <Link href="/settings" title="Einstellungen" className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group-[.collapsed]/sidebar:justify-center group-[.collapsed]/sidebar:px-0">
                    <Settings size={18} className="mr-3 group-[.collapsed]/sidebar:mr-0" />
                    <span className="group-[.collapsed]/sidebar:hidden">Einstellungen</span>
                  </Link>
                  {!isCraftVariant && (
                    <Link href="/integrations" title="Integrationen" className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group-[.collapsed]/sidebar:justify-center group-[.collapsed]/sidebar:px-0">
                      <Blocks size={18} className="mr-3 group-[.collapsed]/sidebar:mr-0" />
                      <span className="group-[.collapsed]/sidebar:hidden">Integrationen</span>
                    </Link>
                  )}
                </>
              )}

              <Link href="/mobile-app" title="Mobile App & API" className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group-[.collapsed]/sidebar:justify-center group-[.collapsed]/sidebar:px-0">
                <Smartphone size={18} className="mr-3 group-[.collapsed]/sidebar:mr-0" />
                <span className="group-[.collapsed]/sidebar:hidden">Mobile App & API</span>
              </Link>
              
              <Link href="/status" title="System Status" className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group-[.collapsed]/sidebar:justify-center group-[.collapsed]/sidebar:px-0">
                <div className="w-[18px] h-[18px] flex items-center justify-center mr-3 group-[.collapsed]/sidebar:mr-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>
                <span className="group-[.collapsed]/sidebar:hidden">System Status</span>
              </Link>
              
              <Link href="/settings/users" title={canManage ? 'Team & Paket' : 'Mein Profil'} className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group-[.collapsed]/sidebar:justify-center group-[.collapsed]/sidebar:px-0">
                <UsersIcon size={18} className="mr-3 group-[.collapsed]/sidebar:mr-0" />
                <span className="group-[.collapsed]/sidebar:hidden">{canManage ? 'Team & Paket' : 'Mein Profil'}</span>
              </Link>

              <a 
                href="/api/help" 
                target="_blank" 
                rel="noopener noreferrer" 
                title="Hilfe"
                className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group-[.collapsed]/sidebar:justify-center group-[.collapsed]/sidebar:px-0"
              >
                <LifeBuoy size={18} className="mr-3 group-[.collapsed]/sidebar:mr-0" />
                <span className="group-[.collapsed]/sidebar:hidden">Hilfe</span>
              </a>

              {(user?.isSuperAdmin || isSupport) && (
                <Link href="/admin" title="Admin Panel" className="flex items-center px-3 py-2 text-sm font-bold rounded-lg text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/5 transition-all mt-4 border-t border-slate-800/50 pt-4 group-[.collapsed]/sidebar:justify-center group-[.collapsed]/sidebar:px-0">
                  <ShieldAlert size={18} className="mr-3 group-[.collapsed]/sidebar:mr-0" />
                  <span className="group-[.collapsed]/sidebar:hidden">Admin Panel →</span>
                </Link>
              )}

              <form action={logoutAction} className="pt-2">
                <button type="submit" title="Abmelden" className="w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-400/5 transition-all group-[.collapsed]/sidebar:justify-center group-[.collapsed]/sidebar:px-0">
                  <LogOut size={18} className="mr-3 group-[.collapsed]/sidebar:mr-0" />
                  <span className="group-[.collapsed]/sidebar:hidden">Abmelden</span>
                </button>
              </form>
            </nav>
          </div>
        </SidebarWrapper>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-[#F8FAFC]">
          <MobileHeader>
            <div className="w-8 h-8 rounded-lg overflow-hidden relative shadow-[0_0_10px_rgba(34,211,238,0.3)]">
              <img src="/icon.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-slate-800 tracking-tight">
              {isCraftVariant ? (
                <>
                  <span className="text-slate-800">Profi</span>
                  <span className="text-cyan-600">Faktura</span>
                </>
              ) : (
                <>
                  <span className="text-slate-800">The</span>
                  <span className="text-cyan-600">Omni</span>
                  <span className="text-slate-800">Stack</span>
                </>
              )}
            </span>
          </MobileHeader>
          <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-auto relative">
            <AutoRefresh />
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}

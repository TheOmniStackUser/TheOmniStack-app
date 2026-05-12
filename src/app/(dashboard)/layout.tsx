import { requireAuth } from '@/lib/session'
import Link from 'next/link'
import { logoutAction } from '@/app/actions/auth'
import { SidebarNav } from './sidebar-nav'
import { db } from '@/db/client'
import { users } from '@/db/schema/auth'
import { eq } from 'drizzle-orm'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const auth = await requireAuth()

  const [user] = await db
    .select({ 
      isSuperAdmin: users.isSuperAdmin,
      twoFactorEnabled: users.twoFactorEnabled 
    })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1)

  const { headers } = await import('next/headers')
  const hdrs = await headers()
  const pathname = (hdrs.get('x-pathname') || '').split('?')[0]
  
  // Mandatory 2FA Check - Block everything except /settings
  if (user && !user.twoFactorEnabled && !pathname.startsWith('/settings')) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-50 text-red-600 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <h2 className="text-3xl font-bold text-slate-900">Sicherheit erforderlich</h2>
          <p className="text-slate-600">
            Um dein Konto und unsere Daten zu schützen, ist die Zwei-Faktor-Authentifizierung (2FA) jetzt verpflichtend.
          </p>
          <div className="pt-4 space-y-3">
            <a 
              href="/settings" 
              className="block w-full py-3 px-4 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all shadow-lg"
            >
              Jetzt 2FA einrichten
            </a>
            <form action={logoutAction}>
              <button type="submit" className="w-full py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-all">
                Abmelden
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      <div className="fixed top-0 left-0 bg-red-500 text-white text-[10px] z-[9999] px-2">
        DEBUG PATH: {pathname}
      </div>
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col flex-shrink-0 overflow-y-auto border-r border-slate-800">
        <div className="p-6">
          <Link href="/dashboard" className="block hover:opacity-80 transition-opacity">
            <h1 className="text-xl font-bold tracking-wider">theomnistack</h1>
          </Link>
        </div>
        <div className="flex-1">
          <SidebarNav />
        </div>
        <div className="p-4 pb-12 border-t border-slate-800">
          <div className="mb-4 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Account
          </div>
          <Link href="/settings" className="block px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
            Einstellungen
          </Link>
          <Link href="/integrations" className="block px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
            Integrationen
          </Link>
          <Link href="/settings/users" className="block px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
            Userverwaltung
          </Link>
          {user?.isSuperAdmin && (
            <Link href="/admin" className="block px-4 py-2 text-sm text-violet-400 font-bold hover:text-violet-300 transition-colors border-t border-slate-800 mt-2 pt-2">
              Admin Panel →
            </Link>
          )}
          <form action={logoutAction}>
            <button type="submit" className="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 transition-colors">
              Abmelden
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto overflow-x-auto">
        {children}
      </main>
    </div>
  )
}

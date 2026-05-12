import { requireAuth } from '@/lib/session'
import Link from 'next/link'
import { redirect } from 'next/navigation'
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
  
  // Mandatory 2FA Check - Redirect to setup if not enabled
  if (user && !user.twoFactorEnabled && !pathname.startsWith('/settings') && !pathname.startsWith('/setup-2fa')) {
    redirect('/setup-2fa')
  }

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
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

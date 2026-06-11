import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { users } from '@/db/schema/auth'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { TwoFactorSetup } from './two-factor-setup'

export default async function Setup2FAPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>
}) {
  const auth = await requireAuth()
  const { shop } = await searchParams

  const [user] = await db
    .select({ twoFactorEnabled: users.twoFactorEnabled })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1)

  // If already enabled, get out of here
  if (user?.twoFactorEnabled) {
    const clientId = process.env.SHOPIFY_CLIENT_ID
    if (shop && clientId) {
      redirect(`https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/apps/${clientId}`)
    } else {
      redirect('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl p-10">
        <div className="text-center space-y-4 mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Sicherheit einrichten</h1>
          <p className="text-slate-600 max-w-md mx-auto">
            Um dein Konto zu schützen, ist die Zwei-Faktor-Authentifizierung (2FA) verpflichtend. Bitte richte sie jetzt ein.
          </p>
        </div>

        <TwoFactorSetup shop={shop} />
      </div>
    </div>
  )
}

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { XCircle } from 'lucide-react'

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const auth = await requireAuth()
  const { token } = await searchParams

  if (!token) {
    return (
      <div className="max-w-md mx-auto mt-12 p-6 bg-white border border-red-100 rounded-2xl shadow-sm space-y-4 text-center">
        <div className="flex justify-center text-red-500">
          <XCircle size={48} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Verifizierung fehlgeschlagen</h2>
        <p className="text-sm text-slate-500">
          Es wurde kein Verifizierungstoken angegeben oder der Token ist ungültig.
        </p>
        <Link
          href="/settings"
          className="inline-flex items-center justify-center px-4 py-2 bg-slate-950 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors"
        >
          Zurück zu den Einstellungen
        </Link>
      </div>
    )
  }

  // Look up the company by verification token
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.emailVerificationToken, token))
    .limit(1)

  if (!company || !company.newPendingEmail) {
    return (
      <div className="max-w-md mx-auto mt-12 p-6 bg-white border border-red-100 rounded-2xl shadow-sm space-y-4 text-center">
        <div className="flex justify-center text-red-500">
          <XCircle size={48} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Verifizierung fehlgeschlagen</h2>
        <p className="text-sm text-slate-500">
          Der Bestätigungslink ist ungültig oder abgelaufen. Bitte fordere in den Einstellungen einen neuen Link an.
        </p>
        <Link
          href="/settings"
          className="inline-flex items-center justify-center px-4 py-2 bg-slate-950 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors"
        >
          Zurück zu den Einstellungen
        </Link>
      </div>
    )
  }

  const verifiedEmail = company.newPendingEmail

  // Update company settings
  await db
    .update(companies)
    .set({
      email: verifiedEmail,
      newPendingEmail: null,
      emailVerificationToken: null,
      emailVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, company.id))

  // Redirect directly to settings with query param
  redirect('/settings?email_verified=true')
}

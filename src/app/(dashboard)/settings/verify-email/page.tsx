import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { CheckCircle2, XCircle, ArrowRight } from 'lucide-react'

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

  // Look up the company by id and token
  const [company] = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.id, auth.activeCompanyId),
        eq(companies.emailVerificationToken, token)
      )
    )
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

  revalidatePath('/settings')

  return (
    <div className="max-w-md mx-auto mt-12 p-8 bg-white border border-green-100 rounded-2xl shadow-sm space-y-6 text-center">
      <div className="flex justify-center text-green-500">
        <CheckCircle2 size={56} className="animate-bounce" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-900">E-Mail verifiziert</h2>
        <p className="text-sm text-slate-600">
          Die E-Mail-Adresse <span className="font-semibold text-slate-900">{verifiedEmail}</span> wurde erfolgreich bestätigt.
        </p>
        <p className="text-xs text-slate-400">
          Dokumente und E-Mails werden nun von dieser Adresse versendet.
        </p>
      </div>
      <div className="pt-2">
        <Link
          href="/settings"
          className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 hover:shadow-blue-500/30 transition-all cursor-pointer"
        >
          Zurück zu den Einstellungen
          <ArrowRight size={18} />
        </Link>
      </div>
    </div>
  )
}

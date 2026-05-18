import { db } from '@/db/client'
import { verificationTokens } from '@/db/schema/auth'
import { eq, and, gt } from 'drizzle-orm'
import { InviteForm } from './invite-form'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function InvitePage({ searchParams }: PageProps) {
  const params = await searchParams
  const token = params.token

  if (!token) {
    return <InvalidTokenScreen />
  }

  // Verify the invitation token in the database
  const [tokenRecord] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.token, token),
        gt(verificationTokens.expiresAt, new Date())
      )
    )
    .limit(1)

  if (!tokenRecord) {
    return <InvalidTokenScreen />
  }

  return <InviteForm token={token} email={tokenRecord.identifier} />
}

function InvalidTokenScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center space-y-6">
        <div className="inline-flex w-12 h-12 rounded-full bg-red-100 text-red-600 items-center justify-center font-bold text-xl shadow-inner">
          ✕
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Ungültiger Link</h1>
          <p className="text-sm text-slate-500">
            Dieser Einladungslink ist leider ungültig oder bereits abgelaufen.
          </p>
        </div>
        <p className="text-xs text-slate-400">
          Bitte wende dich an einen Administrator deiner Firma, um einen neuen Einladungslink zu erhalten.
        </p>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex justify-center w-full py-2.5 px-4 border border-slate-200 rounded-xl font-bold text-slate-700 bg-white hover:bg-slate-50 transition-all text-sm cursor-pointer"
          >
            Zum Login
          </Link>
        </div>
      </div>
    </div>
  )
}

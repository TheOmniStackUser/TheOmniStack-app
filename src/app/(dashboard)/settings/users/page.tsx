import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { companyMembers, companies } from '@/db/schema/companies'
import { users, verificationTokens } from '@/db/schema/auth'
import { eq, gt } from 'drizzle-orm'
import { UserList } from './user-list'

export default async function UserManagementPage() {
  const auth = await requireAuth()

  const [members, tokens, company] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: companyMembers.role,
        joinedAt: companyMembers.joinedAt,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(companyMembers)
      .innerJoin(users, eq(companyMembers.userId, users.id))
      .where(eq(companyMembers.companyId, auth.activeCompanyId)),
    db
      .select({
        identifier: verificationTokens.identifier,
        token: verificationTokens.token,
      })
      .from(verificationTokens)
      .where(gt(verificationTokens.expiresAt, new Date())),
    db
      .select({
        trialExpiresAt: companies.trialExpiresAt,
        canceledAt: companies.canceledAt,
        cancelEffectiveDate: companies.cancelEffectiveDate,
      })
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)
      .then(res => res[0])
  ])

  const enrichedMembers = members.map((m) => {
    const matchingToken = tokens.find(
      (t) => t.identifier.toLowerCase() === m.email.toLowerCase()
    )
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      joinedAt: m.joinedAt,
      isPending: !m.emailVerifiedAt,
      inviteToken: matchingToken ? matchingToken.token : null,
    }
  })

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Team & Paket</h1>
          <p className="text-slate-500 mt-2">Verwalte den Zugriff deines Teams auf diesen Mandanten.</p>
        </div>
      </div>

      <UserList 
        initialMembers={enrichedMembers} 
        currentUserRole={auth.role} 
        currentUserId={auth.userId} 
        subscriptionDetails={company}
      />
    </div>
  )
}

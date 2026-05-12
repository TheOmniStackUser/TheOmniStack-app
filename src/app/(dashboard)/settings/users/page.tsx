import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { companyMembers } from '@/db/schema/companies'
import { users } from '@/db/schema/auth'
import { eq } from 'drizzle-orm'
import { UserList } from './user-list'

export default async function UserManagementPage() {
  const auth = await requireAuth()

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: companyMembers.role,
      joinedAt: companyMembers.joinedAt,
    })
    .from(companyMembers)
    .innerJoin(users, eq(companyMembers.userId, users.id))
    .where(eq(companyMembers.companyId, auth.activeCompanyId))

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Userverwaltung</h1>
          <p className="text-slate-500 mt-2">Verwalte den Zugriff deines Teams auf diesen Mandanten.</p>
        </div>
      </div>

      <UserList initialMembers={members} currentUserRole={auth.role} currentUserId={auth.userId} />
    </div>
  )
}

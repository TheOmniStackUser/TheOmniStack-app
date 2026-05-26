import 'server-only'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { users } from '@/db/schema/auth'
import { companyMembers } from '@/db/schema/companies'
import { eq, and } from 'drizzle-orm'
import { getSession } from './session'

export async function requireSuperAdmin() {
  const payload = await getSession()
  if (!payload) redirect('/login')

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, isSuperAdmin: users.isSuperAdmin })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1)

  if (!user) redirect('/')

  let isSupport = false
  if (payload.activeCompanyId) {
    const [member] = await db
      .select({ role: companyMembers.role })
      .from(companyMembers)
      .where(
        and(
          eq(companyMembers.userId, payload.userId),
          eq(companyMembers.companyId, payload.activeCompanyId)
        )
      )
      .limit(1)
    
    if (member?.role === 'omnistack_support') {
      isSupport = true
    }
  }

  if (!user.isSuperAdmin && !isSupport) redirect('/')

  return user
}

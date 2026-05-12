import 'server-only'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { users } from '@/db/schema/auth'
import { eq } from 'drizzle-orm'
import { getSession } from './session'

export async function requireSuperAdmin() {
  const payload = await getSession()
  if (!payload) redirect('/login')

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, isSuperAdmin: users.isSuperAdmin })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1)

  if (!user || !user.isSuperAdmin) redirect('/')

  return user
}

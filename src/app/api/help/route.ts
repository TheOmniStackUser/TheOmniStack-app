import { getSession, getCurrentUser } from '@/lib/session'
import { db } from '@/db/client'
import { companyMembers } from '@/db/schema/companies'
import { eq, and } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { SignJWT } from 'jose'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch the user's role in their active company
  const session = await getSession()
  let role = 'staff'
  if (session?.activeCompanyId) {
    const [membership] = await db
      .select({ role: companyMembers.role })
      .from(companyMembers)
      .where(and(
        eq(companyMembers.userId, session.userId),
        eq(companyMembers.companyId, session.activeCompanyId)
      ))
      .limit(1)
    if (membership) role = membership.role
  }

  // Must match SSO_SECRET in /var/www/ticketsystem/.env on the ticket server
  const secretKey = process.env.NEXTAUTH_SECRET || 'fallback-secret-for-build-only-do-not-use-in-production'
  const encodedKey = new TextEncoder().encode(secretKey)

  // Sign a short-lived token with user info + role for the ticket system
  const token = await new SignJWT({
    email: user.email,
    username: user.email,
    name: user.name,
    role,  // owner/admin/staff → mapped to ticket system roles
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(encodedKey)

  // Redirect to the /sso endpoint on the ticket system
  redirect(`https://tickets.theomnistack.de/sso?token=${token}`)
}


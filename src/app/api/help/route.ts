import { getCurrentUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { SignJWT } from 'jose'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }

  // Must match SSO_SECRET in /var/www/ticketsystem/.env on the ticket server
  const secretKey = process.env.NEXTAUTH_SECRET || 'fallback-secret-for-build-only-do-not-use-in-production'
  const encodedKey = new TextEncoder().encode(secretKey)

  // Sign a short-lived token with the user's email
  const token = await new SignJWT({
    email: user.email,
    username: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(encodedKey)

  // Redirect to the /sso endpoint on the ticket system
  redirect(`https://tickets.theomnistack.de/sso?token=${token}`)
}

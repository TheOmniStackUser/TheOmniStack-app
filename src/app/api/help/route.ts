import { getCurrentUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { SignJWT } from 'jose'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }

  const secretKey = process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET || 'fallback-secret-for-build-only-do-not-use-in-production'
  const encodedKey = new TextEncoder().encode(secretKey)

  // Sign a short-lived token containing user credentials
  // Include both 'email' and 'username' to cover any expected key in the ticket tool
  const token = await new SignJWT({
    email: user.email,
    username: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m') // Valid for 5 minutes
    .sign(encodedKey)

  redirect(`https://tickets.theomnistack.de/login?token=${token}`)
}

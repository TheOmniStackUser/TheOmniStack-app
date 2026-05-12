import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { sessions, users } from '@/db/schema/auth'
import { companyMembers } from '@/db/schema/companies'
import { eq, and } from 'drizzle-orm'

// ─── Types ────────────────────────────────────────────────────────────────────
export type SessionPayload = {
  sessionId: string
  userId: string
  activeCompanyId: string | null
}

export type AuthContext = {
  userId: string
  activeCompanyId: string
  role: 'owner' | 'admin' | 'member'
}

// ─── Encryption ───────────────────────────────────────────────────────────────
const secretKey = process.env.SESSION_SECRET || 'fallback-secret-for-build-only-do-not-use-in-production'
const encodedKey = new TextEncoder().encode(secretKey)

function verifySecretSet() {
  if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is not set in production!')
  }
}

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)
}

export async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ['HS256'],
    })
    return payload as SessionPayload
  } catch {
    return null
  }
}

// ─── Cookie Management ────────────────────────────────────────────────────────
const COOKIE_NAME = 'omnistack_session'
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

export async function createSession(
  userId: string,
  activeCompanyId: string | null = null
): Promise<void> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const [session] = await db
    .insert(sessions)
    .values({ userId, activeCompanyId, expiresAt })
    .returning({ id: sessions.id })

  const token = await encrypt({
    sessionId: session.id,
    userId,
    activeCompanyId,
  })

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, { ...COOKIE_OPTIONS, expires: expiresAt })
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return decrypt(token)
}

export async function deleteSession(): Promise<void> {
  const payload = await getSession()
  if (payload) {
    await db.delete(sessions).where(eq(sessions.id, payload.sessionId))
  }
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

// ─── 2FA Pending Tokens ───────────────────────────────────────────────────────
const TWO_FACTOR_COOKIE = 'omnistack_2fa_pending'

export async function setTwoFactorPending(userId: string): Promise<void> {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m') // Valid for 10 minutes
    .sign(encodedKey)

  const cookieStore = await cookies()
  cookieStore.set(TWO_FACTOR_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: 600 })
}

export async function getTwoFactorPending(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TWO_FACTOR_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ['HS256'],
    })
    return (payload as { userId: string }).userId
  } catch {
    return null
  }
}

export async function clearTwoFactorPending(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(TWO_FACTOR_COOKIE)
}

// ─── Auth Guard ───────────────────────────────────────────────────────────────
/**
 * Use in Server Components and Server Actions that require authentication.
 * Redirects to /login if the user is unauthenticated.
 * Redirects to /select-company if the user hasn't selected a company context.
 */
export async function requireAuth(): Promise<AuthContext> {
  const payload = await getSession()

  if (!payload) redirect('/login')
  if (!payload.activeCompanyId) redirect('/select-company')

  // Verify the user still has access to the active company
  const [membership] = await db
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.userId, payload.userId),
        eq(companyMembers.companyId, payload.activeCompanyId)
      )
    )
    .limit(1)

  if (!membership) redirect('/select-company')

  return {
    userId: payload.userId,
    activeCompanyId: payload.activeCompanyId,
    role: membership.role,
  }
}

/**
 * Get the current user record. Returns null if not authenticated.
 */
export async function getCurrentUser() {
  const payload = await getSession()
  if (!payload) return null

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1)

  return user ?? null
}

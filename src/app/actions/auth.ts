'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '@/db/client'
import { users } from '@/db/schema/auth'
import { companyMembers, companies } from '@/db/schema/companies'
import { createSession, deleteSession, getSession } from '@/lib/session'
import { auditLog } from '@/lib/audit'
import { eq, and } from 'drizzle-orm'
import { headers } from 'next/headers'

// ─── Schemas ──────────────────────────────────────────────────────────────────
const LoginSchema = z.object({
  email: z.string().email({ message: 'Bitte gib eine gültige E-Mail ein.' }).trim(),
  password: z.string().min(1, { message: 'Passwort ist erforderlich.' }),
})

const RegisterSchema = z.object({
  name: z.string().min(2, { message: 'Name muss mindestens 2 Zeichen lang sein.' }).trim(),
  email: z.string().email({ message: 'Bitte gib eine gültige E-Mail ein.' }).trim(),
  password: z
    .string()
    .min(8, { message: 'Passwort muss mindestens 8 Zeichen lang sein.' })
    .regex(/[A-Z]/, { message: 'Muss einen Großbuchstaben enthalten.' })
    .regex(/[0-9]/, { message: 'Muss eine Zahl enthalten.' }),
  companyName: z.string().min(2, { message: 'Firmenname ist erforderlich.' }).trim(),
  companyLegalName: z.string().min(2, { message: 'Rechtlicher Name ist erforderlich.' }).trim(),
})

export type AuthFormState =
  | { errors?: Record<string, string[]>; message?: string; fields?: Record<string, string> }
  | undefined

// ─── Login ────────────────────────────────────────────────────────────────────
export async function loginAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const validated = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { email, password } = validated.data

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { message: 'Ungültige E-Mail oder Passwort.' }
  }

  if (!user.isActive) {
    return { message: 'Dieses Konto wurde deaktiviert.' }
  }

  // Two-Factor Authentication Check
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const { setTwoFactorPending } = await import('@/lib/session')
    await setTwoFactorPending(user.id)
    redirect('/login/2fa')
  }

  // Find the user's first company to set as active context
  const [membership] = await db
    .select({ companyId: companyMembers.companyId })
    .from(companyMembers)
    .where(eq(companyMembers.userId, user.id))
    .limit(1)

  await createSession(user.id, membership?.companyId ?? null)

  const hdrs = await headers()
  await auditLog({
    userId: user.id,
    companyId: membership?.companyId,
    action: 'login',
    entityType: 'user',
    entityId: user.id,
    ipAddress: hdrs.get('x-forwarded-for') ?? 'unknown',
    userAgent: hdrs.get('user-agent') ?? 'unknown',
  })

  redirect(membership ? '/dashboard' : '/select-company')
}

// ─── Verify 2FA Login ─────────────────────────────────────────────────────────
export async function verifyTwoFactorLoginAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const code = formData.get('code') as string
  if (!code) return { message: 'Bitte gib den 2FA-Code ein.' }

  const { getTwoFactorPending, clearTwoFactorPending, createSession } = await import('@/lib/session')
  const userId = await getTwoFactorPending()

  if (!userId) {
    redirect('/login')
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user || !user.twoFactorSecret) {
    redirect('/login')
  }

  const { verifyTwoFactorToken } = await import('@/lib/two-factor')
  const isValid = verifyTwoFactorToken(code, user.twoFactorSecret)

  if (!isValid) {
    return { message: 'Ungültiger 2FA-Code. Bitte versuche es erneut.' }
  }

  // Success - Clear pending state and create session
  await clearTwoFactorPending()

  const [membership] = await db
    .select({ companyId: companyMembers.companyId })
    .from(companyMembers)
    .where(eq(companyMembers.userId, user.id))
    .limit(1)

  await createSession(user.id, membership?.companyId ?? null)

  const hdrs = await headers()
  await auditLog({
    userId: user.id,
    companyId: membership?.companyId,
    action: 'login_2fa',
    entityType: 'user',
    entityId: user.id,
    ipAddress: hdrs.get('x-forwarded-for') ?? 'unknown',
    userAgent: hdrs.get('user-agent') ?? 'unknown',
  })

  redirect(membership ? '/dashboard' : '/select-company')
}

// ─── Register ─────────────────────────────────────────────────────────────────
export async function registerAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const validated = RegisterSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    companyName: formData.get('companyName'),
    companyLegalName: formData.get('companyLegalName'),
  })

  if (!validated.success) {
    const fields = Object.fromEntries(formData.entries()) as Record<string, string>
    return { errors: validated.error.flatten().fieldErrors, fields }
  }

  const { name, email, password, companyName, companyLegalName } = validated.data

  // Check for duplicate email
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  if (existing) {
    const fields = Object.fromEntries(formData.entries()) as Record<string, string>
    return { errors: { email: ['Diese E-Mail-Adresse ist bereits registriert.'] }, fields }
  }

  const passwordHash = await bcrypt.hash(password, 12)

  let newUserId: string | null = null
  let newCompanyId: string | null = null

  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ name, email: email.toLowerCase(), passwordHash })
      .returning({ id: users.id })

    const [company] = await tx
      .insert(companies)
      .values({ name: companyName, legalName: companyLegalName })
      .returning({ id: companies.id })

    await tx.insert(companyMembers).values({
      userId: user.id,
      companyId: company.id,
      role: 'owner',
    })

    newUserId = user.id
    newCompanyId = company.id
  })

  if (newUserId && newCompanyId) {
    await createSession(newUserId, newCompanyId)
  }

  redirect('/setup-2fa')
}

// ─── Logout ───────────────────────────────────────────────────────────────────
export async function logoutAction(): Promise<void> {
  await deleteSession()
  redirect('/login')
}

// ─── Switch Company ───────────────────────────────────────────────────────────
export async function switchCompanyAction(formData: FormData) {
  const companyId = formData.get('companyId') as string
  const session = await getSession()

  if (!session || !companyId) redirect('/login')

  const [membership] = await db
    .select()
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.userId, session.userId),
        eq(companyMembers.companyId, companyId)
      )
    )
    .limit(1)

  if (!membership) {
    redirect('/select-company')
  }

  await createSession(session.userId, companyId)
  redirect('/dashboard')
}

// ─── Setup 2FA ────────────────────────────────────────────────────────────────
export async function setupTwoFactorAction() {
  const { requireAuth } = await import('@/lib/session')
  const { userId } = await requireAuth()

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) throw new Error('User not found')

  const { generateTwoFactorSecret, getTwoFactorUrl, generateQrCode } = await import('@/lib/two-factor')
  
  const secret = generateTwoFactorSecret()
  const url = getTwoFactorUrl(user.email, secret)
  const qrCodeUrl = await generateQrCode(url)

  return { secret, qrCodeUrl }
}

// ─── Enable 2FA ───────────────────────────────────────────────────────────────
export async function enableTwoFactorAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const code = formData.get('code') as string
  const secret = formData.get('secret') as string

  if (!code || !secret) {
    return { message: 'Code und Secret sind erforderlich.' }
  }

  const { requireAuth } = await import('@/lib/session')
  const { userId } = await requireAuth()

  const { verifyTwoFactorToken, enableTwoFactor } = await import('@/lib/two-factor')
  const isValid = verifyTwoFactorToken(code, secret)

  if (!isValid) {
    return { message: 'Ungültiger Code. Bitte versuche es erneut.' }
  }

  await enableTwoFactor(userId, secret)
  
  return { message: 'Zweistufige Authentifizierung wurde erfolgreich aktiviert.' }
}

// ─── Disable 2FA ──────────────────────────────────────────────────────────────
export async function disableTwoFactorAction() {
  const { requireAuth } = await import('@/lib/session')
  const { userId } = await requireAuth()

  const { disableTwoFactor } = await import('@/lib/two-factor')
  await disableTwoFactor(userId)

  return { message: 'Zweistufige Authentifizierung wurde deaktiviert.' }
}

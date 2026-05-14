'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '@/db/client'
import { users, pendingRegistrations, verificationTokens } from '@/db/schema/auth'
import { companyMembers, companies } from '@/db/schema/companies'
import { createSession, deleteSession, getSession } from '@/lib/session'
import { auditLog } from '@/lib/audit'
import { eq, and, gt } from 'drizzle-orm'
import { headers } from 'next/headers'
import crypto from 'crypto'
import { sendVerificationEmail } from '@/lib/email'

// ─── Schemas ──────────────────────────────────────────────────────────────────
const LoginSchema = z.object({
  email: z.string().email({ message: 'Bitte gib eine gültige E-Mail ein.' }).trim(),
  password: z.string().min(1, { message: 'Passwort ist erforderlich.' }),
})

const RegisterSchema = z.object({
  email: z.string().email({ message: 'Bitte gib eine gültige E-Mail ein.' }).trim(),
  password: z
    .string()
    .min(8, { message: 'Passwort muss mindestens 8 Zeichen lang sein.' })
    .regex(/[A-Z]/, { message: 'Muss einen Großbuchstaben enthalten.' })
    .regex(/[0-9]/, { message: 'Muss eine Zahl enthalten.' }),
})

const DetailsSchema = z.object({
  name: z.string().min(2, { message: 'Name muss mindestens 2 Zeichen lang sein.' }).trim(),
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

  if (!user.emailVerifiedAt) {
    // Generate a verification token for the existing user
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 3600 * 1000) // 1 hour

    await db
      .insert(verificationTokens)
      .values({
        identifier: email.toLowerCase(),
        token,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: verificationTokens.token,
        set: { expiresAt, createdAt: new Date() }
      })

    const { sendVerificationEmail } = await import('@/lib/email')
    await sendVerificationEmail(email.toLowerCase(), token)

    return { message: 'Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir gerade einen neuen Bestätigungslink gesendet.' }
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

// ─── Step 1: Start Registration (Email + PW) ──────────────────────────────────
export async function startRegistrationAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const validated = RegisterSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!validated.success) {
    const fields = Object.fromEntries(formData.entries()) as Record<string, string>
    return { errors: validated.error.flatten().fieldErrors, fields }
  }

  const { email, password } = validated.data

  // Check if user already exists
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  if (existing) {
    return { message: 'Diese E-Mail-Adresse wird bereits verwendet.' }
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 3600 * 1000) // 1 hour

  await db
    .insert(pendingRegistrations)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      token,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: pendingRegistrations.email,
      set: { token, passwordHash, expiresAt, createdAt: new Date() }
    })

  await sendVerificationEmail(email.toLowerCase(), token)

  redirect('/register/check-email')
}

// ─── Step 2: Verify Email & Load Pending Data ─────────────────────────────────
export async function verifyEmailTokenAction(token: string) {
  if (!token) redirect('/register')

  const [pending] = await db
    .select()
    .from(pendingRegistrations)
    .where(
      and(
        eq(pendingRegistrations.token, token),
        gt(pendingRegistrations.expiresAt, new Date())
      )
    )
    .limit(1)

  if (!pending) {
    // Check if it's an existing user verifying their email
    const [existingToken] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.token, token),
          gt(verificationTokens.expiresAt, new Date())
        )
      )
      .limit(1)

    if (existingToken) {
      // Mark existing user as verified
      await db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.email, existingToken.identifier.toLowerCase()))

      // Cleanup token
      await db.delete(verificationTokens).where(eq(verificationTokens.id, existingToken.id))

      return { success: true, message: 'E-Mail erfolgreich bestätigt. Du kannst dich jetzt einloggen.' }
    }

    return { error: 'Ungültiger oder abgelaufener Verifizierungslink.' }
  }

  return { email: pending.email }
}

// ─── Step 3: Complete Registration (Name + Company) ───────────────────────────
export async function completeRegistrationAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const token = formData.get('token') as string
  const validated = DetailsSchema.safeParse({
    name: formData.get('name'),
    companyName: formData.get('companyName'),
    companyLegalName: formData.get('companyLegalName'),
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const [pending] = await db
    .select()
    .from(pendingRegistrations)
    .where(eq(pendingRegistrations.token, token))
    .limit(1)

  if (!pending) {
    return { message: 'Registrierungssitzung abgelaufen.' }
  }

  const { name, companyName, companyLegalName } = validated.data

  let newUserId: string | null = null
  let newCompanyId: string | null = null

  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ 
        name, 
        email: pending.email, 
        passwordHash: pending.passwordHash,
        emailVerifiedAt: new Date() 
      })
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

    // Cleanup pending registration
    await tx.delete(pendingRegistrations).where(eq(pendingRegistrations.id, pending.id))

    newUserId = user.id
    newCompanyId = company.id
  })

  if (newUserId && newCompanyId) {
    await createSession(newUserId, newCompanyId)
  }

  redirect('/setup-2fa')
}

// ─── Legacy Register (Remove later or keep for compatibility) ────────────────
export async function registerAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  // We now use startRegistrationAction
  return startRegistrationAction(_state, formData)
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
  const rawCode = formData.get('code') as string
  const secret = formData.get('secret') as string

  // Sanitize code (remove spaces)
  const code = rawCode?.replace(/\s+/g, '')

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

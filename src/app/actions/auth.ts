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

const rateLimitMap = new Map<string, { count: number, resetAt: number }>()

async function getAppName() {
  const hdrs = await headers()
  const host = hdrs.get('host') || ''
  if (host.includes('profifaktura')) {
    return 'ProfiFaktura'
  }
  return process.env.APP_NAME || 'TheOmniStack'
}

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
  terms: z.literal('on', { error: () => ({ message: 'Du musst den Dokumenten zustimmen.' }) }),
})

const DetailsSchema = z.object({
  name: z.string().min(2, { message: 'Name muss mindestens 2 Zeichen lang sein.' }).trim(),
  companyName: z.string().min(2, { message: 'Firmenname ist erforderlich.' }).trim(),
  companyLegalName: z.string().min(2, { message: 'Rechtlicher Name ist erforderlich.' }).trim(),
})

const ForgotPasswordSchema = z.object({
  email: z.string().email({ message: 'Bitte gib eine gültige E-Mail ein.' }).trim(),
})

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token ist erforderlich'),
  password: z
    .string()
    .min(8, { message: 'Passwort muss mindestens 8 Zeichen lang sein.' })
    .regex(/[A-Z]/, { message: 'Muss einen Großbuchstaben enthalten.' })
    .regex(/[0-9]/, { message: 'Muss eine Zahl enthalten.' }),
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

  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for') ?? 'unknown'
  const rateKey = `${ip}_${email.toLowerCase()}`
  const now = Date.now()

  if (Math.random() < 0.1) {
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetAt) rateLimitMap.delete(key)
    }
  }

  const limit = rateLimitMap.get(rateKey)
  if (limit && now < limit.resetAt) {
    if (limit.count >= 5) {
      return { message: 'Zu viele Login-Versuche. Bitte versuche es in 15 Minuten erneut.' }
    }
    limit.count++
  } else {
    rateLimitMap.set(rateKey, { count: 1, resetAt: now + 15 * 60 * 1000 })
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
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

  // Update last login
  await db
    .update(users)
    .set({
      lastLoginAt: new Date(),
      lastLoginApp: await getAppName()
    })
    .where(eq(users.id, user.id))

  // Find the user's first company to set as active context
  const [membership] = await db
    .select({ companyId: companyMembers.companyId })
    .from(companyMembers)
    .where(eq(companyMembers.userId, user.id))
    .limit(1)

  await createSession(user.id, membership?.companyId ?? null)

  await auditLog({
    userId: user.id,
    companyId: membership?.companyId,
    action: 'login',
    entityType: 'user',
    entityId: user.id,
    ipAddress: hdrs.get('x-forwarded-for') ?? 'unknown',
    userAgent: hdrs.get('user-agent') ?? 'unknown',
  })

  // Check if there is a pending Shopify install
  const { getShopifyPendingInstall, clearShopifyPendingInstall } = await import('@/lib/session')
  const pendingShopify = await getShopifyPendingInstall()

  let shopForRedirect: string | null = null

  if (pendingShopify && membership?.companyId) {
    const { marketplaceIntegrations } = await import('@/db/schema/integrations')
    
    // Check if integration already exists
    const [existingIntegration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, membership.companyId),
          eq(marketplaceIntegrations.type, 'shopify')
        )
      )

    if (existingIntegration) {
      await db
        .update(marketplaceIntegrations)
        .set({
          environment: pendingShopify.shop,
          accessToken: pendingShopify.accessToken,
          isActive: true,
          updatedAt: new Date(),
          metadata: { ...((existingIntegration.metadata as any) || {}), shop: pendingShopify.shopMetadata }
        })
        .where(eq(marketplaceIntegrations.id, existingIntegration.id))
    } else {
      await db.insert(marketplaceIntegrations).values({
        companyId: membership.companyId,
        type: 'shopify',
        environment: pendingShopify.shop,
        accessToken: pendingShopify.accessToken,
        isActive: true,
        metadata: { shop: pendingShopify.shopMetadata }
      })
    }

    shopForRedirect = pendingShopify.shop
    await clearShopifyPendingInstall()
  }

  if (shopForRedirect) {
    const clientId = process.env.SHOPIFY_CLIENT_ID
    if (clientId) {
      redirect(`https://admin.shopify.com/store/${shopForRedirect.replace('.myshopify.com', '')}/apps/${clientId}`)
    }
  }

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

  // Update last login
  await db
    .update(users)
    .set({
      lastLoginAt: new Date(),
      lastLoginApp: await getAppName()
    })
    .where(eq(users.id, user.id))

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

  // Check if there is a pending Shopify install
  const { getShopifyPendingInstall, clearShopifyPendingInstall } = await import('@/lib/session')
  const pendingShopify = await getShopifyPendingInstall()

  let shopForRedirect: string | null = null

  if (pendingShopify && membership?.companyId) {
    const { marketplaceIntegrations } = await import('@/db/schema/integrations')
    
    // Check if integration already exists
    const [existingIntegration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, membership.companyId),
          eq(marketplaceIntegrations.type, 'shopify')
        )
      )

    if (existingIntegration) {
      await db
        .update(marketplaceIntegrations)
        .set({
          environment: pendingShopify.shop,
          accessToken: pendingShopify.accessToken,
          isActive: true,
          updatedAt: new Date(),
          metadata: { ...((existingIntegration.metadata as any) || {}), shop: pendingShopify.shopMetadata }
        })
        .where(eq(marketplaceIntegrations.id, existingIntegration.id))
    } else {
      await db.insert(marketplaceIntegrations).values({
        companyId: membership.companyId,
        type: 'shopify',
        environment: pendingShopify.shop,
        accessToken: pendingShopify.accessToken,
        isActive: true,
        metadata: { shop: pendingShopify.shopMetadata }
      })
    }

    shopForRedirect = pendingShopify.shop
    await clearShopifyPendingInstall()
  }

  if (shopForRedirect) {
    const clientId = process.env.SHOPIFY_CLIENT_ID
    if (clientId) {
      redirect(`https://admin.shopify.com/store/${shopForRedirect.replace('.myshopify.com', '')}/apps/${clientId}`)
    }
  }

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
    terms: formData.get('terms'),
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

  const { getShopifyPendingInstall, clearShopifyPendingInstall } = await import('@/lib/session')
  const pendingShopify = await getShopifyPendingInstall()

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
      .values({ 
        name: companyName, 
        legalName: companyLegalName,
        registeredApp: await getAppName(),
        trialExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
      })
      .returning({ id: companies.id })

    if (pendingShopify) {
      const { marketplaceIntegrations } = await import('@/db/schema/integrations')
      await tx.insert(marketplaceIntegrations).values({
        companyId: company.id,
        type: 'shopify',
        environment: pendingShopify.shop,
        accessToken: pendingShopify.accessToken,
        isActive: true,
        metadata: { shop: pendingShopify.shopMetadata }
      })
    }

    const isOwnerEmail = pending.email.toLowerCase() === 'leis@guggen-mountain.com'
    await tx.insert(companyMembers).values({
      userId: user.id,
      companyId: company.id,
      role: isOwnerEmail ? 'owner' : 'admin',
    })

    // Cleanup pending registration
    await tx.delete(pendingRegistrations).where(eq(pendingRegistrations.id, pending.id))

    newUserId = user.id
    newCompanyId = company.id
  })

  let shopForRedirect: string | null = null
  if (pendingShopify) {
    shopForRedirect = pendingShopify.shop
    await clearShopifyPendingInstall()
  }

  if (newUserId && newCompanyId) {
    await createSession(newUserId, newCompanyId)
  }

  redirect(shopForRedirect ? `/setup-2fa?shop=${shopForRedirect}` : '/setup-2fa')
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
  const shop = formData.get('shop') as string | null

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
  
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const redirectUrl = shop && clientId 
    ? `https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/apps/${clientId}` 
    : '/dashboard'

  return { message: 'Zweistufige Authentifizierung wurde erfolgreich aktiviert.', fields: { redirectTo: redirectUrl } }
}

// ─── Disable 2FA ──────────────────────────────────────────────────────────────
export async function disableTwoFactorAction() {
  const { requireAuth } = await import('@/lib/session')
  const { userId } = await requireAuth()

  const { disableTwoFactor } = await import('@/lib/two-factor')
  await disableTwoFactor(userId)

  return { message: 'Zweistufige Authentifizierung wurde deaktiviert.' }
}

// ─── Accept Invitation ────────────────────────────────────────────────────────
const AcceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token ist erforderlich'),
  password: z
    .string()
    .min(8, { message: 'Passwort muss mindestens 8 Zeichen lang sein.' })
    .regex(/[A-Z]/, { message: 'Muss einen Großbuchstaben enthalten.' })
    .regex(/[0-9]/, { message: 'Muss eine Zahl enthalten.' }),
})

export async function acceptInvitationAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const token = formData.get('token') as string
  const password = formData.get('password') as string

  const validated = AcceptInvitationSchema.safeParse({ token, password })
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  // Find verification token
  const [tokenRecord] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.token, token),
        gt(verificationTokens.expiresAt, new Date())
      )
    )
    .limit(1)

  if (!tokenRecord) {
    return { message: 'Der Einladungslink ist ungültig oder abgelaufen.' }
  }

  const email = tokenRecord.identifier.toLowerCase()

  // Find user by email
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!user) {
    return { message: 'Benutzerkonto wurde nicht gefunden.' }
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(password, 12)

  // Update user's password and verify their email
  await db
    .update(users)
    .set({
      passwordHash,
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      lastLoginApp: await getAppName()
    })
    .where(eq(users.id, user.id))

  // Delete the verification token so it can't be reused
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.token, token))

  // Find user's company membership to set active company context
  const [membership] = await db
    .select({ companyId: companyMembers.companyId })
    .from(companyMembers)
    .where(eq(companyMembers.userId, user.id))
    .limit(1)

  // Create session
  await createSession(user.id, membership?.companyId ?? null)

  // Audit log
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

  // Redirect to dashboard
  redirect('/dashboard')
}

// ─── Forgot Password ─────────────────────────────────────────────────────────
export async function forgotPasswordAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const validated = ForgotPasswordSchema.safeParse({
    email: formData.get('email'),
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { email } = validated.data

  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for') ?? 'unknown'
  const rateKey = `reset_${ip}_${email.toLowerCase()}`
  const now = Date.now()

  const limit = rateLimitMap.get(rateKey)
  if (limit && now < limit.resetAt) {
    if (limit.count >= 3) {
      return { message: 'Zu viele Anfragen. Bitte versuche es in 15 Minuten erneut.' }
    }
    limit.count++
  } else {
    rateLimitMap.set(rateKey, { count: 1, resetAt: now + 15 * 60 * 1000 })
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  // We return a generic success message even if the user doesn't exist to prevent email enumeration
  if (!user || !user.isActive) {
    return { message: 'Falls ein Konto mit dieser E-Mail-Adresse existiert, haben wir dir einen Link zum Zurücksetzen gesendet.', fields: { success: 'true' } }
  }

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

  const { sendPasswordResetEmail } = await import('@/lib/email')
  await sendPasswordResetEmail(email.toLowerCase(), token)

  return { message: 'Falls ein Konto mit dieser E-Mail-Adresse existiert, haben wir dir einen Link zum Zurücksetzen gesendet.', fields: { success: 'true' } }
}

// ─── Reset Password ──────────────────────────────────────────────────────────
export async function resetPasswordAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const token = formData.get('token') as string
  const password = formData.get('password') as string

  const validated = ResetPasswordSchema.safeParse({ token, password })
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  // Find verification token
  const [tokenRecord] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.token, token),
        gt(verificationTokens.expiresAt, new Date())
      )
    )
    .limit(1)

  if (!tokenRecord) {
    return { message: 'Der Link zum Zurücksetzen ist ungültig oder abgelaufen.' }
  }

  const email = tokenRecord.identifier.toLowerCase()

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!user) {
    return { message: 'Benutzerkonto wurde nicht gefunden.' }
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await db
    .update(users)
    .set({
      passwordHash,
    })
    .where(eq(users.id, user.id))

  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.id, tokenRecord.id))

  return { message: 'Dein Passwort wurde erfolgreich geändert. Du kannst dich jetzt einloggen.', fields: { success: 'true' } }
}

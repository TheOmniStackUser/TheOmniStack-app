'use server'

import { db } from '@/db/client'
import { users, verificationTokens } from '@/db/schema/auth'
import { companyMembers, companies } from '@/db/schema/companies'
import { requireAuth } from '@/lib/session'
import { eq, and, ne, gt } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import crypto from 'crypto'
import { sendInvitationEmail } from '@/lib/email'

const CreateUserSchema = z.object({
  name: z.string().min(2, 'Name ist zu kurz'),
  email: z.string().email('Ungültige E-Mail'),
  role: z.enum(['admin', 'staff', 'omnistack_support', 'omnistack_beta']),
})

export async function addUserAction(formData: FormData) {
  const auth = await requireAuth()
  if (auth.role !== 'owner' && auth.role !== 'admin' && auth.role !== 'omnistack_support' && auth.role !== 'omnistack_beta') {
    throw new Error('Keine Berechtigung')
  }

  const validated = CreateUserSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!validated.success) {
    return { error: validated.error.issues[0].message }
  }

  const { name, email, role } = validated.data

  // Security check: Only owners can create Omnistack Support accounts
  if (role === 'omnistack_support' && auth.role !== 'owner') {
    return { error: 'Nur Besitzer können Support-Accounts anlegen' }
  }

  try {
    // Check member limit (max 10)
    const currentMembers = await db
      .select()
      .from(companyMembers)
      .where(eq(companyMembers.companyId, auth.activeCompanyId))
    
    if (currentMembers.length >= 10) {
      return { error: 'Maximale Anzahl von 10 Benutzern erreicht.' }
    }

    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)

    let userId = existingUser?.id

    if (!existingUser) {
      // Create invited user with a completely random password they cannot guess
      const tempPassword = 'INVITED_USER_' + crypto.randomBytes(16).toString('hex')
      const passwordHash = await bcrypt.hash(tempPassword, 12)
      const [newUser] = await db
        .insert(users)
        .values({
          name,
          email: email.toLowerCase(),
          passwordHash,
        })
        .returning({ id: users.id })
      userId = newUser.id
    }

    // Check if already a member
    const [existingMember] = await db
      .select()
      .from(companyMembers)
      .where(
        and(
          eq(companyMembers.userId, userId),
          eq(companyMembers.companyId, auth.activeCompanyId)
        )
      )
      .limit(1)

    if (existingMember) {
      return { error: 'Benutzer ist bereits Mitglied dieses Mandanten' }
    }

    await db.insert(companyMembers).values({
      userId,
      companyId: auth.activeCompanyId,
      role: role as any,
    })

    // Generate secure invitation token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000) // 48 hours

    await db.insert(verificationTokens).values({
      identifier: email.toLowerCase(),
      token,
      expiresAt,
    })

    // Send invitation email and capture result
    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)

    let emailError: string | null = null
    if (company) {
      const [adminUser] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, auth.userId))
        .limit(1)

      const emailResult = await sendInvitationEmail(
        email.toLowerCase(),
        adminUser?.name || 'Ein Administrator',
        company.name,
        token
      )

      if (!emailResult.success) {
        emailError = (emailResult.error as any)?.message || 'Fehler beim E-Mail-Dienst (Resend)'
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const inviteLink = `${baseUrl}/invite?token=${token}`

    revalidatePath('/settings/users')
    return { success: true, inviteLink, emailError }
  } catch (e) {
    console.error(e)
    return { error: 'Fehler beim Erstellen des Benutzers' }
  }
}

export async function removeUserAction(userId: string) {
  const auth = await requireAuth()
  if (auth.role !== 'owner' && auth.role !== 'admin' && auth.role !== 'omnistack_support' && auth.role !== 'omnistack_beta') {
    throw new Error('Keine Berechtigung')
  }

  // Cannot remove self
  if (userId === auth.userId) {
    return { error: 'Du kannst dich nicht selbst entfernen' }
  }

  // Check if user is owner (cannot be removed by admin)
  const [member] = await db
    .select()
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.userId, userId),
        eq(companyMembers.companyId, auth.activeCompanyId)
      )
    )
    .limit(1)

  if (!member) return { error: 'Mitglied nicht gefunden' }
  if (member.role === 'owner' && auth.role !== 'owner') {
    return { error: 'Besitzer können nur von anderen Besitzern entfernt werden' }
  }

  await db
    .delete(companyMembers)
    .where(
      and(
        eq(companyMembers.userId, userId),
        eq(companyMembers.companyId, auth.activeCompanyId)
      )
    )

  revalidatePath('/settings/users')
  return { success: true }
}

export async function getOrCreateInviteLinkAction(email: string) {
  const auth = await requireAuth()
  if (auth.role !== 'owner' && auth.role !== 'admin' && auth.role !== 'omnistack_support' && auth.role !== 'omnistack_beta') {
    throw new Error('Keine Berechtigung')
  }

  // Check if token exists and is valid
  const [existingToken] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email.toLowerCase()),
        gt(verificationTokens.expiresAt, new Date())
      )
    )
    .limit(1)

  let token = existingToken?.token

  if (!existingToken) {
    // Generate new token
    token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000) // 48 hours

    await db.insert(verificationTokens).values({
      identifier: email.toLowerCase(),
      token,
      expiresAt,
    })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return { inviteLink: `${baseUrl}/invite?token=${token}` }
}

const UpdateProfileSchema = z.object({
  name: z.string().min(2, 'Name muss mindestens 2 Zeichen lang sein.').trim(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
})

export async function updateCurrentUserAction(formData: FormData) {
  const auth = await requireAuth()

  const data = {
    name: formData.get('name') as string,
    currentPassword: (formData.get('currentPassword') as string) || undefined,
    newPassword: (formData.get('newPassword') as string) || undefined,
    confirmPassword: (formData.get('confirmPassword') as string) || undefined,
  }

  const validated = UpdateProfileSchema.safeParse(data)
  if (!validated.success) {
    return { error: validated.error.issues[0].message }
  }

  const { name, currentPassword, newPassword, confirmPassword } = validated.data
  const changePassword = formData.get('changePassword') === 'true'

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1)

    if (!user) {
      return { error: 'Benutzer nicht gefunden' }
    }

    const updateFields: any = {
      name,
      updatedAt: new Date(),
    }

    if (changePassword) {
      if (!currentPassword) {
        return { error: 'Das aktuelle Passwort ist erforderlich.' }
      }
      if (!newPassword || newPassword.length < 8) {
        return { error: 'Das neue Passwort muss mindestens 8 Zeichen lang sein.' }
      }
      if (newPassword !== confirmPassword) {
        return { error: 'Das neue Passwort und die Bestätigung stimmen nicht überein.' }
      }

      // Compare current password
      const isCorrect = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!isCorrect) {
        return { error: 'Das eingegebene aktuelle Passwort ist falsch.' }
      }

      updateFields.passwordHash = await bcrypt.hash(newPassword, 12)
    }

    await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, auth.userId))

    revalidatePath('/settings/users')
    return { success: true }
  } catch (e) {
    console.error(e)
    return { error: 'Fehler beim Aktualisieren des Profils.' }
  }
}


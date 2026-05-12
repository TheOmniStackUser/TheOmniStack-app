'use server'

import { db } from '@/db/client'
import { users } from '@/db/schema/auth'
import { companyMembers } from '@/db/schema/companies'
import { requireAuth } from '@/lib/session'
import { eq, and, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const CreateUserSchema = z.object({
  name: z.string().min(2, 'Name ist zu kurz'),
  email: z.string().email('Ungültige E-Mail'),
  password: z.string().min(8, 'Passwort muss mindestens 8 Zeichen haben'),
  role: z.enum(['admin', 'member']),
})

export async function addUserAction(formData: FormData) {
  const auth = await requireAuth()
  if (auth.role !== 'owner' && auth.role !== 'admin') {
    throw new Error('Keine Berechtigung')
  }

  const validated = CreateUserSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!validated.success) {
    return { error: validated.error.issues[0].message }
  }

  const { name, email, password, role } = validated.data

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
      const passwordHash = await bcrypt.hash(password, 12)
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
      role,
    })

    revalidatePath('/settings/users')
    return { success: true }
  } catch (e) {
    console.error(e)
    return { error: 'Fehler beim Erstellen des Benutzers' }
  }
}

export async function removeUserAction(userId: string) {
  const auth = await requireAuth()
  if (auth.role !== 'owner' && auth.role !== 'admin') {
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

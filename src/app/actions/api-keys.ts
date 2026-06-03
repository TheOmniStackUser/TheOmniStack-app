'use server'

import { db } from '@/db/client'
import { companies, companyMembers } from '@/db/schema/companies'
import { eq, and } from 'drizzle-orm'
import { getSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

import crypto from 'crypto'

export async function getApiKeyAction() {
  const session = await getSession()
  if (!session?.activeCompanyId) throw new Error('Unauthorized')

  const [member] = await db
    .select({ apiKey: companyMembers.apiKey })
    .from(companyMembers)
    .where(and(
      eq(companyMembers.companyId, session.activeCompanyId),
      eq(companyMembers.userId, session.userId)
    ))
    .limit(1)

  return member?.apiKey
}

export async function generateApiKeyAction() {
  const session = await getSession()
  if (!session?.activeCompanyId) throw new Error('Unauthorized')

  // Generate a completely secure, cryptographically random high-entropy hex string
  const newApiKey = `os_live_${crypto.randomBytes(24).toString('hex')}`

  try {
    await db
      .update(companyMembers)
      .set({ apiKey: newApiKey })
      .where(and(
        eq(companyMembers.companyId, session.activeCompanyId),
        eq(companyMembers.userId, session.userId)
      ))

    revalidatePath('/settings')
    return newApiKey
  } catch (error) {
    console.error("Error generating API key:", error)
    throw error
  }
}

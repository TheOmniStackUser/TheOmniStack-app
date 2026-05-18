'use server'

import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

import crypto from 'crypto'

export async function getApiKeyAction() {
  const session = await getSession()
  if (!session?.activeCompanyId) throw new Error('Unauthorized')

  const [company] = await db
    .select({ apiKey: companies.apiKey })
    .from(companies)
    .where(eq(companies.id, session.activeCompanyId))
    .limit(1)

  return company?.apiKey
}

export async function generateApiKeyAction() {
  const session = await getSession()
  if (!session?.activeCompanyId) throw new Error('Unauthorized')

  // Generate a completely secure, cryptographically random high-entropy hex string
  const newApiKey = `os_live_${crypto.randomBytes(24).toString('hex')}`

  await db
    .update(companies)
    .set({ apiKey: newApiKey })
    .where(eq(companies.id, session.activeCompanyId))

  revalidatePath('/settings')
  return newApiKey
}

'use server'

import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export async function getApiKeyAction() {
  const session = await getSession()
  if (!session?.companyId) throw new Error('Unauthorized')

  const [company] = await db
    .select({ apiKey: companies.apiKey })
    .from(companies)
    .where(eq(companies.id, session.companyId))
    .limit(1)

  return company?.apiKey
}

export async function generateApiKeyAction() {
  const session = await getSession()
  if (!session?.companyId) throw new Error('Unauthorized')

  const newApiKey = `os_${Buffer.from(Math.random().toString()).toString('hex').slice(0, 32)}`

  await db
    .update(companies)
    .set({ apiKey: newApiKey })
    .where(eq(companies.id, session.companyId))

  revalidatePath('/settings')
  return newApiKey
}

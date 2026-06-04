'use server'

import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'
import { requireSuperAdmin } from '@/lib/admin-session'
import { revalidatePath } from 'next/cache'

export async function extendTrialAction(companyId: string, days: number) {
  await requireSuperAdmin()

  const [company] = await db
    .select({ trialExpiresAt: companies.trialExpiresAt })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!company) throw new Error('Company not found')

  const currentExpiry = company.trialExpiresAt ? new Date(company.trialExpiresAt) : new Date()
  // Ensure we start from now if the trial is already expired
  const baseDate = currentExpiry.getTime() > Date.now() ? currentExpiry : new Date()
  
  const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000)

  await db
    .update(companies)
    .set({ trialExpiresAt: newExpiry })
    .where(eq(companies.id, companyId))

  revalidatePath(`/admin/merchants/${companyId}`)
  revalidatePath('/admin/merchants')
  
  return { success: true }
}

export async function toggleCompanyFeatureAction(companyId: string, feature: 'returns' | 'products', enabled: boolean) {
  await requireSuperAdmin()

  const updateData = feature === 'returns' 
    ? { featuresReturnsEnabled: enabled }
    : { featuresProductsEnabled: enabled }

  await db
    .update(companies)
    .set(updateData)
    .where(eq(companies.id, companyId))

  revalidatePath(`/admin/merchants/${companyId}`)
  
  return { success: true }
}

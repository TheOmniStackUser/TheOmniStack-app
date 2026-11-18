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

export async function updateCompanyBillingAddressAction(companyId: string, data: {
  legalName?: string
  street?: string
  zip?: string
  city?: string
  country?: string
  warehouseStreet?: string
  warehouseZip?: string
  warehouseCity?: string
  warehouseCountry?: string
  website?: string
  vatId?: string
  taxId?: string
  email?: string
  phone?: string
}) {
  await requireSuperAdmin()

  const [existing] = await db
    .select({ id: companies.id, legalName: companies.legalName, country: companies.country })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!existing) throw new Error('Company not found')

  await db
    .update(companies)
    .set({
      legalName: data.legalName !== undefined && data.legalName.trim() !== '' ? data.legalName.trim() : existing.legalName,
      street: data.street !== undefined ? data.street.trim() || null : undefined,
      zip: data.zip !== undefined ? data.zip.trim() || null : undefined,
      city: data.city !== undefined ? data.city.trim() || null : undefined,
      country: data.country ? data.country.trim() : existing.country,
      warehouseStreet: data.warehouseStreet !== undefined ? data.warehouseStreet.trim() || null : undefined,
      warehouseZip: data.warehouseZip !== undefined ? data.warehouseZip.trim() || null : undefined,
      warehouseCity: data.warehouseCity !== undefined ? data.warehouseCity.trim() || null : undefined,
      warehouseCountry: data.warehouseCountry ? data.warehouseCountry.trim() : undefined,
      website: data.website !== undefined ? data.website.trim() || null : undefined,
      vatId: data.vatId !== undefined ? data.vatId.trim() || null : undefined,
      taxId: data.taxId !== undefined ? data.taxId.trim() || null : undefined,
      email: data.email !== undefined ? data.email.trim() || null : undefined,
      phone: data.phone !== undefined ? data.phone.trim() || null : undefined,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId))

  revalidatePath('/admin')
  revalidatePath('/admin/billing')
  revalidatePath(`/admin/merchants/${companyId}`)
  revalidatePath('/admin/merchants')

  return { success: true }
}

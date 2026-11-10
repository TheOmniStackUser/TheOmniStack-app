'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { DpdAdapter, type DpdConfig } from '@/adapters/shipping/dpd'
import { z } from 'zod'

const DpdIntegrationSchema = z.object({
  delisId: z.string().min(1, 'DelisID ist erforderlich'),
  password: z.string().optional(),
  depot: z.string().optional(),
  customerNumber: z.string().optional(),
  environment: z.enum(['production', 'stage']).default('production'),
  defaultWeight: z.coerce.number().min(0.01).default(1.0),
  labelFormat: z.enum(['A6', 'A4']).default('A6'),
})

export type DpdActionState = {
  success?: boolean
  message?: string
  errors?: Record<string, string[] | undefined>
}

export async function saveDpdIntegrationAction(
  prevState: DpdActionState | undefined,
  formData: FormData
): Promise<DpdActionState> {
  const auth = await requireAuth()

  const raw = {
    delisId: formData.get('delisId'),
    password: formData.get('password') || undefined,
    depot: formData.get('depot') || undefined,
    customerNumber: formData.get('customerNumber') || undefined,
    environment: formData.get('environment') || 'production',
    defaultWeight: formData.get('defaultWeight') || 1.0,
    labelFormat: formData.get('labelFormat') || 'A6',
  }

  const validated = DpdIntegrationSchema.safeParse(raw)
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { delisId, password, depot, customerNumber, environment, defaultWeight, labelFormat } = validated.data

  const [existing] = await db
    .select({
      id: marketplaceIntegrations.id,
      clientSecret: marketplaceIntegrations.clientSecret,
      metadata: marketplaceIntegrations.metadata,
    })
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.type, 'dpd')
      )
    )
    .limit(1)

  const finalPassword = password && password.trim().length > 0 ? password.trim() : existing?.clientSecret

  if (!finalPassword) {
    return { errors: { password: ['Passwort ist erforderlich (noch kein Passwort hinterlegt).'] } }
  }

  const existingMeta = (existing?.metadata as Record<string, any>) || {}
  const metadata: Partial<DpdConfig> = {
    ...existingMeta,
    depot: depot?.trim() || undefined,
    customerNumber: customerNumber?.trim() || undefined,
    environment,
    defaultWeight,
    labelFormat,
  }
  // Clean up any legacy autoInvoice property in metadata
  delete (metadata as any).autoInvoice

  if (existing) {
    await db
      .update(marketplaceIntegrations)
      .set({
        clientId: delisId.trim(),
        clientSecret: finalPassword,
        environment,
        autoInvoice: false,
        metadata,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceIntegrations.id, existing.id))
  } else {
    await db
      .insert(marketplaceIntegrations)
      .values({
        companyId: auth.activeCompanyId,
        type: 'dpd',
        clientId: delisId.trim(),
        clientSecret: finalPassword,
        environment,
        autoInvoice: false,
        metadata,
        isActive: true,
      })
  }

  revalidatePath('/integrations')
  return { success: true, message: 'DPD Zugangsdaten wurden erfolgreich gespeichert!' }
}

export async function testDpdConnectionAction(data: {
  delisId: string
  password?: string
  depot?: string
  customerNumber?: string
  environment?: 'production' | 'stage'
}): Promise<{
  success: boolean
  depot?: string
  customerNumber?: string
  customerName?: string
  error?: string
}> {
  const auth = await requireAuth()

  let password = data.password?.trim()
  if (!password) {
    const [existing] = await db
      .select({ clientSecret: marketplaceIntegrations.clientSecret })
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.type, 'dpd')
        )
      )
      .limit(1)

    password = existing?.clientSecret || undefined
  }

  if (!data.delisId || !password) {
    return {
      success: false,
      error: 'Bitte DelisID und Passwort angeben, um die Verbindung zu testen.',
    }
  }

  const adapter = new DpdAdapter(null, {
    delisId: data.delisId.trim(),
    password,
    depot: data.depot?.trim(),
    customerNumber: data.customerNumber?.trim(),
    environment: data.environment || 'production',
  })

  return await adapter.testConnection()
}

export async function disconnectDpdAction(): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAuth()

  try {
    await db
      .update(marketplaceIntegrations)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.type, 'dpd')
        )
      )

    revalidatePath('/integrations')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Fehler beim Deaktivieren von DPD.' }
  }
}

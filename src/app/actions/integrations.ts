'use server'

import { z } from 'zod'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { companies } from '@/db/schema/companies'
import { requireAuth } from '@/lib/session'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { marketplaceSyncQueue } from '@/workers/marketplace-sync'

const OttoIntegrationSchema = z.object({
  clientId: z.string().min(1, { message: 'Client ID ist erforderlich.' }).trim(),
  clientSecret: z.string().min(1, { message: 'Client Secret ist erforderlich.' }).trim(),
  environment: z.enum(['production', 'sandbox']).default('production'),
  returnAddressCarrierId: z.string().trim().optional(),
})

export type IntegrationFormState =
  | { errors?: Record<string, string[]>; message?: string; success?: boolean }
  | undefined

export async function saveOttoIntegrationAction(
  _state: IntegrationFormState,
  formData: FormData
): Promise<IntegrationFormState> {
  const auth = await requireAuth()

  const validated = OttoIntegrationSchema.safeParse({
    clientId: formData.get('clientId'),
    clientSecret: formData.get('clientSecret'),
    environment: formData.get('environment'),
    returnAddressCarrierId: formData.get('returnAddressCarrierId'),
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { clientId, clientSecret, environment, returnAddressCarrierId } = validated.data

  const metadata = returnAddressCarrierId ? { returnAddressCarrierId } : null

  // Check if integration already exists
  const [existing] = await db
    .select({ id: marketplaceIntegrations.id })
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.type, 'otto')
      )
    )
    .limit(1)

  if (existing) {
    await db
      .update(marketplaceIntegrations)
      .set({ clientId, clientSecret, environment, metadata, updatedAt: new Date() })
      .where(eq(marketplaceIntegrations.id, existing.id))
  } else {
    await db
      .insert(marketplaceIntegrations)
      .values({
        companyId: auth.activeCompanyId,
        type: 'otto',
        clientId,
        clientSecret,
        environment,
        metadata,
      })
  }

  revalidatePath('/integrations')
  return { success: true, message: 'Otto.de Zugangsdaten wurden erfolgreich gespeichert!' }
}

const HermesIntegrationSchema = z.object({
  clientId: z.string().min(1, { message: 'Benutzername ist erforderlich.' }).trim(),
  clientSecret: z.string().trim().optional(), // Optional: keep existing if not changed
  hermesConfig: z.string().optional(), // JSON string from form
})

export async function saveHermesIntegrationAction(
  _state: IntegrationFormState,
  formData: FormData
): Promise<IntegrationFormState> {
  const auth = await requireAuth()

  const validated = HermesIntegrationSchema.safeParse({
    clientId: formData.get('clientId'),
    clientSecret: formData.get('clientSecret'),
    hermesConfig: formData.get('hermesConfig'),
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { clientId, clientSecret, hermesConfig } = validated.data
  const metadata = hermesConfig ? JSON.parse(hermesConfig) : null

  const [existing] = await db
    .select({ 
      id: marketplaceIntegrations.id, 
      clientSecret: marketplaceIntegrations.clientSecret,
      metadata: marketplaceIntegrations.metadata
    })
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.type, 'hermes')
      )
    )
    .limit(1)

  // Use the new password if provided, otherwise keep the existing one from the DB
  const finalSecret = (clientSecret && clientSecret.length > 0) ? clientSecret : existing?.clientSecret

  if (!finalSecret) {
    return { errors: { clientSecret: ['Passwort ist erforderlich (noch kein Passwort gespeichert).'] } }
  }

  if (existing) {
    await db
      .update(marketplaceIntegrations)
      .set({ 
        clientId, 
        clientSecret: finalSecret, 
        metadata: metadata ?? existing.metadata,
        updatedAt: new Date() 
      })
      .where(eq(marketplaceIntegrations.id, existing.id))
  } else {
    await db
      .insert(marketplaceIntegrations)
      .values({
        companyId: auth.activeCompanyId,
        type: 'hermes',
        clientId,
        clientSecret: finalSecret,
        metadata: metadata
      })
  }

  revalidatePath('/integrations')
  return { success: true, message: 'Hermes Zugangsdaten wurden erfolgreich gespeichert!' }
}

const MiraklIntegrationSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  type: z.enum(['mirakl_decathlon', 'mirakl_decathlon_eu', 'mirakl_mediamarkt', 'mirakl_custom']),
  customName: z.string().optional().nullable(),
  clientId: z.string().min(1, { message: 'API-Key/Client ID ist erforderlich.' }).trim(),
  clientSecret: z.string().trim().nullable().optional(),
  environment: z.string().url({ message: 'Bitte gib eine gültige API URL an (inkl. https://).' }).trim(),
  apiKey: z.string().nullable().optional(),
})

export async function saveMiraklIntegrationAction(
  _state: IntegrationFormState,
  formData: FormData
): Promise<IntegrationFormState> {
  const auth = await requireAuth()

  const validated = MiraklIntegrationSchema.safeParse({
    id: formData.get('id'),
    type: formData.get('type'),
    customName: formData.get('customName'),
    clientId: formData.get('clientId'),
    clientSecret: formData.get('clientSecret') || undefined,
    environment: formData.get('environment'),
    apiKey: formData.get('apiKey') || undefined,
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { id, type, customName, clientId, clientSecret, environment, apiKey } = validated.data

  let existing = null

  if (id) {
    const [found] = await db
      .select({ id: marketplaceIntegrations.id })
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.id, id)
        )
      )
      .limit(1)
    existing = found
  } else if (type !== 'mirakl_custom') {
    const [found] = await db
      .select({ id: marketplaceIntegrations.id })
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.type, type as any)
        )
      )
      .limit(1)
    existing = found
  }

  const metadata = type === 'mirakl_custom' ? { customName: customName || 'Unbenannter Marktplatz' } : null

  if (existing) {
    await db
      .update(marketplaceIntegrations)
      .set({ clientId, clientSecret, environment, apiKey, metadata, updatedAt: new Date() })
      .where(eq(marketplaceIntegrations.id, existing.id))
  } else {
    await db
      .insert(marketplaceIntegrations)
      .values({
        companyId: auth.activeCompanyId,
        type: type as any,
        clientId,
        clientSecret,
        environment,
        apiKey,
        metadata,
      })
  }

  revalidatePath('/integrations')
  return { success: true, message: 'Mirakl Zugangsdaten wurden erfolgreich gespeichert!' }
}

const AmazonIntegrationSchema = z.object({
  sellerId: z.string().min(1, { message: 'Seller ID ist erforderlich.' }).trim(),
  clientId: z.string().min(1, { message: 'Client ID ist erforderlich.' }).trim(),
  clientSecret: z.string().min(1, { message: 'Client Secret ist erforderlich.' }).trim(),
  refreshToken: z.string().min(1, { message: 'Refresh Token ist erforderlich.' }).trim(),
})

export async function saveAmazonIntegrationAction(
  _state: IntegrationFormState,
  formData: FormData
): Promise<IntegrationFormState> {
  const auth = await requireAuth()

  const validated = AmazonIntegrationSchema.safeParse({
    sellerId: formData.get('sellerId'),
    clientId: formData.get('clientId'),
    clientSecret: formData.get('clientSecret'),
    refreshToken: formData.get('refreshToken'),
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { sellerId, clientId, clientSecret, refreshToken } = validated.data

  const [existing] = await db
    .select({ id: marketplaceIntegrations.id })
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.type, 'amazon')
      )
    )
    .limit(1)

  if (existing) {
    await db
      .update(marketplaceIntegrations)
      .set({ sellerId, clientId, clientSecret, refreshToken, updatedAt: new Date() })
      .where(eq(marketplaceIntegrations.id, existing.id))
  } else {
    await db
      .insert(marketplaceIntegrations)
      .values({
        companyId: auth.activeCompanyId,
        type: 'amazon',
        sellerId,
        clientId,
        clientSecret,
        refreshToken,
      })
  }

  revalidatePath('/integrations')
  return { success: true, message: 'Amazon Zugangsdaten wurden erfolgreich gespeichert!' }
}

export async function saveDhlIntegrationAction(
  _state: IntegrationFormState,
  formData: FormData
): Promise<IntegrationFormState> {
  const auth = await requireAuth()

  const raw = formData.get('dhlConfig')
  if (!raw || typeof raw !== 'string') {
    return { success: false, message: 'Ungültige Konfiguration.' }
  }

  let config: unknown
  try {
    config = JSON.parse(raw)
  } catch {
    return { success: false, message: 'Konfiguration konnte nicht gelesen werden.' }
  }

  const [existing] = await db
    .select({ id: marketplaceIntegrations.id })
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.type, 'dhl')
      )
    )
    .limit(1)

  if (existing) {
    await db
      .update(marketplaceIntegrations)
      .set({ metadata: config, updatedAt: new Date() })
      .where(eq(marketplaceIntegrations.id, existing.id))
  } else {
    await db
      .insert(marketplaceIntegrations)
      .values({
        companyId: auth.activeCompanyId,
        type: 'dhl',
        metadata: config,
      })
  }

  revalidatePath('/integrations')
  return { success: true, message: 'DHL Konfiguration wurde erfolgreich gespeichert!' }
}

const ShopifyIntegrationSchema = z.object({
  environment: z.string().url({ message: 'Bitte gib eine gültige Shop URL an (inkl. https://).' }).trim(),
  clientId: z.string().min(1, { message: 'Client ID ist erforderlich.' }).trim(),
  clientSecret: z.string().min(1, { message: 'Client Secret ist erforderlich.' }).trim(),
})

export async function saveShopifyIntegrationAction(
  _state: IntegrationFormState,
  formData: FormData
): Promise<IntegrationFormState> {
  const auth = await requireAuth()

  const validated = ShopifyIntegrationSchema.safeParse({
    environment: formData.get('environment'),
    clientId: formData.get('clientId'),
    clientSecret: formData.get('clientSecret'),
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { environment, clientId, clientSecret } = validated.data

  // Test connection before saving
  try {
    const { ShopifyAdapter } = await import('@/adapters/marketplace/shopify')
    const adapter = new ShopifyAdapter()
    // We need a dummy companyId or a way to pass credentials directly.
    // For now, let's just try to fetch a token using the credentials directly
    const shopUrl = environment.replace(/\/$/, '')
    const tokenRes = await fetch(`${shopUrl}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials'
      })
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      return { 
        success: false, 
        message: `Verbindung zu Shopify fehlgeschlagen: ${tokenRes.status}. Prüfe Client ID und Secret. Antwort: ${errText}` 
      }
    }
  } catch (e: any) {
    return { success: false, message: `Fehler beim Testen der Verbindung: ${e.message}` }
  }

  const [existing] = await db
    .select({ id: marketplaceIntegrations.id })
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.type, 'shopify')
      )
    )
    .limit(1)

  if (existing) {
    await db
      .update(marketplaceIntegrations)
      .set({ environment, clientId, clientSecret, updatedAt: new Date() })
      .where(eq(marketplaceIntegrations.id, existing.id))
  } else {
    await db
      .insert(marketplaceIntegrations)
      .values({
        companyId: auth.activeCompanyId,
        type: 'shopify',
        environment,
        clientId,
        clientSecret,
      })
  }

  revalidatePath('/integrations')
  return { success: true, message: 'Shopify Verbindung erfolgreich getestet und gespeichert!' }
}

const AboutYouIntegrationSchema = z.object({
  apiKey: z.string().min(1, { message: 'API-Key ist erforderlich.' }).trim(),
  environment: z.enum(['production', 'sandbox']).default('production'),
})

export async function saveAboutYouIntegrationAction(
  _state: IntegrationFormState,
  formData: FormData
): Promise<IntegrationFormState> {
  const auth = await requireAuth()

  const validated = AboutYouIntegrationSchema.safeParse({
    apiKey: formData.get('apiKey'),
    environment: formData.get('environment'),
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { apiKey, environment } = validated.data

  const [existing] = await db
    .select({ id: marketplaceIntegrations.id })
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.type, 'aboutyou')
      )
    )
    .limit(1)

  if (existing) {
    await db
      .update(marketplaceIntegrations)
      .set({ apiKey, environment, updatedAt: new Date() })
      .where(eq(marketplaceIntegrations.id, existing.id))
  } else {
    await db
      .insert(marketplaceIntegrations)
      .values({
        companyId: auth.activeCompanyId,
        type: 'aboutyou',
        apiKey,
        environment,
      })
  }

  revalidatePath('/integrations')
  return { success: true, message: 'About You Zugangsdaten wurden erfolgreich gespeichert!' }
}

const SyncSettingsSchema = z.object({
  fetchOrdersDaily: z.boolean(),
  fetchOrdersTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Ungültiges Uhrzeitformat (HH:MM).' }),
  fetchOrdersMarketplaces: z.array(z.string().uuid()),
})

export async function saveSyncSettingsAction(
  _state: IntegrationFormState,
  formData: FormData
): Promise<IntegrationFormState> {
  const auth = await requireAuth()

  const fetchOrdersDaily = formData.get('fetchOrdersDaily') === 'true'
  const fetchOrdersTime = (formData.get('fetchOrdersTime') as string) || '03:00'
  const marketplacesListRaw = (formData.get('marketplacesList') as string) || '[]'
  
  let fetchOrdersMarketplaces: string[] = []
  try {
    fetchOrdersMarketplaces = JSON.parse(marketplacesListRaw)
  } catch (rawErr) {
    return { success: false, message: 'Ungültige Marktplatzauswahl.' }
  }

  const validated = SyncSettingsSchema.safeParse({
    fetchOrdersDaily,
    fetchOrdersTime,
    fetchOrdersMarketplaces,
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const data = validated.data

  // Update company config in the database
  await db
    .update(companies)
    .set({
      fetchOrdersDaily: data.fetchOrdersDaily,
      fetchOrdersTime: data.fetchOrdersTime,
      fetchOrdersMarketplaces: data.fetchOrdersMarketplaces,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, auth.activeCompanyId))

  // Clean up any existing repeatable sync jobs in Redis for this company
  try {
    const repeatableJobs = await marketplaceSyncQueue.getRepeatableJobs()
    const client = await marketplaceSyncQueue.client
    for (const job of repeatableJobs) {
      const redisKey = `${marketplaceSyncQueue.toKey('repeat')}:${job.key}:${job.next}`
      const jobData = await client.hgetall(redisKey)
      let jobId: string | null = null
      if (jobData && jobData.opts) {
        try {
          const opts = JSON.parse(jobData.opts)
          jobId = opts.repeat?.jobId || opts.jobId || null
        } catch (e) {}
      }

      if (jobId?.startsWith(`daily-sync-${auth.activeCompanyId}`)) {
        await marketplaceSyncQueue.removeRepeatableByKey(job.key)
        console.log(`   - Cleared old repeatable sync job: ${jobId}`)
      }
    }

    // Schedule the new repeatable job if daily fetching is enabled and at least one marketplace is selected
    if (data.fetchOrdersDaily && data.fetchOrdersMarketplaces.length > 0) {
      const [hourStr, minuteStr] = data.fetchOrdersTime.split(':')
      const hour = parseInt(hourStr || '0', 10)
      const minute = parseInt(minuteStr || '0', 10)
      const cronPattern = `${minute} ${hour} * * *`

      await marketplaceSyncQueue.add(
        'daily-marketplace-sync',
        { companyId: auth.activeCompanyId },
        {
          jobId: `daily-sync-${auth.activeCompanyId}`,
          repeat: {
            pattern: cronPattern,
            tz: 'Europe/Berlin',
          },
          removeOnComplete: true,
        }
      )
    }
  } catch (err: any) {
    console.error('[SyncSettingsAction] Failed to manage repeatable BullMQ jobs:', err)
    return { success: false, message: 'Einstellungen in DB gespeichert, aber Redis-Job konnte nicht konfiguriert werden.' }
  }

  revalidatePath('/integrations')
  return { success: true, message: 'Automatisierungseinstellungen wurden erfolgreich gespeichert!' }
}

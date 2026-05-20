'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function saveCompanySettingsAction(prevState: any, formData: FormData) {
  const auth = await requireAuth()

  const name = formData.get('name') as string
  const legalName = formData.get('legalName') as string
  const vatId = formData.get('vatId') as string
  const taxId = formData.get('taxId') as string
  const street = formData.get('street') as string
  const zip = formData.get('zip') as string
  const city = formData.get('city') as string
  const country = formData.get('country') as string || 'DE'

  const warehouseStreet = formData.get('warehouseStreet') as string
  const warehouseZip = formData.get('warehouseZip') as string
  const warehouseCity = formData.get('warehouseCity') as string
  const warehouseCountry = formData.get('warehouseCountry') as string || 'DE'

  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const website = formData.get('website') as string

  const logoFile = formData.get('logoFile') as File | null
  const existingLogoUrl = formData.get('existingLogoUrl') as string
  let logoUrl = existingLogoUrl

  if (logoFile && logoFile.size > 0) {
    const buffer = Buffer.from(await logoFile.arrayBuffer())
    const base64 = buffer.toString('base64')
    logoUrl = `data:${logoFile.type};base64,${base64}`
  }

  const paymentRecipient = formData.get('paymentRecipient') as string
  const bankName = formData.get('bankName') as string
  const iban = formData.get('iban') as string
  const bic = formData.get('bic') as string
  const management = formData.get('management') as string
  const registrationCourt = formData.get('registrationCourt') as string
  const deliveryNoteFooter = formData.get('deliveryNoteFooter') as string
  const deliveryNoteFooterEn = formData.get('deliveryNoteFooterEn') as string
  const returnsNote = formData.get('returnsNote') as string
  const returnsNoteEn = formData.get('returnsNoteEn') as string
  const internationalLanguage = formData.get('internationalLanguage') as string || 'en'

  try {
    await db
      .update(companies)
      .set({
        name,
        legalName,
        vatId,
        taxId,
        street,
        zip,
        city,
        country,
        warehouseStreet,
        warehouseZip,
        warehouseCity,
        warehouseCountry,
        email,
        phone,
        website,
        logoUrl,
        paymentRecipient,
        bankName,
        iban,
        bic,
        management,
        registrationCourt,
        deliveryNoteFooter,
        deliveryNoteFooterEn,
        returnsNote,
        returnsNoteEn,
        internationalLanguage,
        updatedAt: new Date()
      })
      .where(eq(companies.id, auth.activeCompanyId))

    revalidatePath('/settings')
    return { success: true, message: 'Unternehmensdaten erfolgreich gespeichert.' }
  } catch (error) {
    console.error('Error saving company settings:', error)
    return { success: false, message: 'Fehler beim Speichern der Daten.' }
  }
}

export async function saveVatSettingAction(prevState: any, formData: FormData) {
  const auth = await requireAuth()
  const { vatSettings } = await import('@/db/schema/vat-settings')
  const { and } = await import('drizzle-orm')

  const countryCode = formData.get('countryCode') as string
  const vatType = formData.get('vatType') as string
  const localVatId = formData.get('localVatId') as string
  const vatRateRaw = formData.get('vatRate') as string | null
  
  let vatRate = 0
  if (vatType !== 'third_country' && vatRateRaw) {
    vatRate = parseFloat(vatRateRaw.replace(',', '.')) / 100
  }

  if (!countryCode || (vatType !== 'third_country' && isNaN(vatRate))) {
    return { success: false, message: 'Ungültige Eingaben.' }
  }

  try {
    const existing = await db.query.vatSettings.findFirst({
      where: and(
        eq(vatSettings.companyId, auth.activeCompanyId),
        eq(vatSettings.countryCode, countryCode.toUpperCase())
      )
    })

    if (existing) {
      await db.update(vatSettings)
        .set({ 
          vatType,
          vatRate: vatRate.toString(), 
          localVatId: vatType === 'local' ? localVatId : null,
          updatedAt: new Date() 
        })
        .where(eq(vatSettings.id, existing.id))
    } else {
      await db.insert(vatSettings).values({
        companyId: auth.activeCompanyId,
        countryCode: countryCode.toUpperCase(),
        vatType,
        vatRate: vatRate.toString(),
        localVatId: vatType === 'local' ? localVatId : null
      })
    }

    revalidatePath('/settings')
    return { success: true, message: 'Steuersatz gespeichert.' }
  } catch (error) {
    console.error('Error saving VAT setting:', error)
    return { success: false, message: 'Fehler beim Speichern des Steuersatzes.' }
  }
}

export async function deleteVatSettingAction(id: string) {
  const auth = await requireAuth()
  const { vatSettings } = await import('@/db/schema/vat-settings')
  const { and } = await import('drizzle-orm')

  try {
    await db.delete(vatSettings)
      .where(and(
        eq(vatSettings.id, id),
        eq(vatSettings.companyId, auth.activeCompanyId)
      ))

    revalidatePath('/settings')
    return { success: true }
  } catch (error) {
    console.error('Error deleting VAT setting:', error)
    return { success: false, message: 'Fehler beim Löschen.' }
  }
}

export async function saveMarketplaceAutomationAction(integrationId: string, autoInvoice: boolean, uploadInvoice: boolean) {
  const auth = await requireAuth()
  const { marketplaceIntegrations } = await import('@/db/schema/integrations')
  const { and } = await import('drizzle-orm')

  try {
    await db.update(marketplaceIntegrations)
      .set({ 
        autoInvoice,
        uploadInvoice,
        updatedAt: new Date()
      })
      .where(and(
        eq(marketplaceIntegrations.id, integrationId),
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId)
      ))

    revalidatePath('/settings')
    return { success: true, message: 'Automatisierung gespeichert.' }
  } catch (error) {
    console.error('Error saving marketplace automation:', error)
    return { success: false, message: 'Fehler beim Speichern.' }
  }
}

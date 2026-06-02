'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function saveCompanySettingsAction(prevState: any, formData: FormData) {
  const auth = await requireAuth()

  try {
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)

    if (!company) {
      return { success: false, message: 'Unternehmen nicht gefunden.' }
    }

    const updateData: Record<string, any> = {
      updatedAt: new Date()
    }

    const setIfPresent = (key: string, dbKey: string = key) => {
      const val = formData.get(key)
      if (val !== null) {
        updateData[dbKey] = val as string
      }
    }

    setIfPresent('name')
    setIfPresent('legalName')
    setIfPresent('vatId')
    setIfPresent('taxId')
    setIfPresent('street')
    setIfPresent('zip')
    setIfPresent('city')
    if (formData.has('country')) {
      updateData.country = formData.get('country') as string || 'DE'
    }

    setIfPresent('warehouseStreet')
    setIfPresent('warehouseZip')
    setIfPresent('warehouseCity')
    if (formData.has('warehouseCountry')) {
      updateData.warehouseCountry = formData.get('warehouseCountry') as string || 'DE'
    }

    setIfPresent('phone')
    setIfPresent('website')

    // Handle logoUrl
    if (formData.has('logoFile') || formData.has('existingLogoUrl')) {
      const logoFile = formData.get('logoFile') as File | null
      const existingLogoUrl = formData.get('existingLogoUrl') as string
      let logoUrl = existingLogoUrl

      if (logoFile && logoFile.size > 0) {
        const buffer = Buffer.from(await logoFile.arrayBuffer())
        const base64 = buffer.toString('base64')
        logoUrl = `data:${logoFile.type};base64,${base64}`
      }
      updateData.logoUrl = logoUrl
    }

    // Handle email
    let sentVerification = false
    if (formData.has('email')) {
      const email = formData.get('email') as string
      let emailToUpdate: string | null = company.email
      let newPendingEmail: string | null = company.newPendingEmail
      let emailVerificationToken: string | null = company.emailVerificationToken
      let emailVerifiedAt: Date | null = company.emailVerifiedAt

      const submittedEmail = email?.trim().toLowerCase() || ''
      const currentEmail = company.email?.trim().toLowerCase() || ''

      if (!submittedEmail) {
        emailToUpdate = null
        newPendingEmail = null
        emailVerificationToken = null
        emailVerifiedAt = null
      } else if (submittedEmail !== currentEmail) {
        // It's a new email address, keep current active email until verified
        newPendingEmail = submittedEmail
        const crypto = await import('crypto')
        emailVerificationToken = crypto.randomUUID()
        
        const { sendCompanyEmailVerificationEmail } = await import('@/lib/email')
        await sendCompanyEmailVerificationEmail(
          submittedEmail,
          (formData.get('name') as string) || company.name,
          emailVerificationToken
        )
        sentVerification = true
      }

      updateData.email = emailToUpdate
      updateData.newPendingEmail = newPendingEmail
      updateData.emailVerificationToken = emailVerificationToken
      updateData.emailVerifiedAt = emailVerifiedAt
    }

    setIfPresent('paymentRecipient')
    setIfPresent('bankName')
    setIfPresent('iban')
    setIfPresent('bic')
    setIfPresent('management')
    setIfPresent('registrationCourt')
    setIfPresent('deliveryNoteFooter')
    setIfPresent('deliveryNoteFooterEn')
    setIfPresent('invoiceFooter')
    setIfPresent('invoiceFooterEn')
    setIfPresent('offerFooter')
    setIfPresent('offerFooterEn')
    setIfPresent('returnsNote')
    setIfPresent('returnsNoteEn')

    if (formData.has('internationalLanguage')) {
      updateData.internationalLanguage = formData.get('internationalLanguage') as string || 'en'
    }

    await db
      .update(companies)
      .set(updateData)
      .where(eq(companies.id, auth.activeCompanyId))

    revalidatePath('/settings')
    
    if (sentVerification) {
      return { 
        success: true, 
        message: 'Einstellungen gespeichert. Bitte bestätige die neue E-Mail-Adresse (Link gesendet).' 
      }
    }

    return { success: true, message: 'Unternehmensdaten erfolgreich gespeichert.' }
  } catch (error) {
    console.error('Error saving company settings:', error)
    return { success: false, message: 'Fehler beim Speichern der Daten.' }
  }
}

export async function resendCompanyVerificationEmailAction() {
  const auth = await requireAuth()
  try {
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)

    if (!company || !company.newPendingEmail || !company.emailVerificationToken) {
      return { success: false, message: 'Keine ausstehende E-Mail-Verifizierung gefunden.' }
    }

    const { sendCompanyEmailVerificationEmail } = await import('@/lib/email')
    await sendCompanyEmailVerificationEmail(
      company.newPendingEmail,
      company.name,
      company.emailVerificationToken
    )

    return { success: true, message: 'Bestätigungslink wurde erneut gesendet.' }
  } catch (err: any) {
    console.error('Error resending verification email:', err)
    return { success: false, message: 'Fehler beim Senden der Bestätigungs-E-Mail.' }
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

export async function saveMarketplaceAutomationAction(
  integrationId: string, 
  autoInvoice: boolean, 
  uploadInvoice: boolean,
  downloadInvoice?: boolean,
  autoCreditNote?: boolean,
  autoRefund?: boolean
) {
  const auth = await requireAuth()
  const { marketplaceIntegrations } = await import('@/db/schema/integrations')
  const { and, eq } = await import('drizzle-orm')

  try {
    // Fetch current integration to retrieve existing metadata
    const existing = await db
      .select({ 
        metadata: marketplaceIntegrations.metadata,
        autoInvoice: marketplaceIntegrations.autoInvoice
      })
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.id, integrationId),
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId)
        )
      )
      .limit(1)

    if (existing.length === 0) {
      return { success: false, message: 'Integration nicht gefunden.' }
    }

    const currentMetadata = (existing[0].metadata as Record<string, any>) || {}
    
    // Track when autoInvoice is enabled
    let autoInvoiceEnabledAt = currentMetadata.autoInvoiceEnabledAt
    if (autoInvoice && !existing[0].autoInvoice) {
      autoInvoiceEnabledAt = new Date().toISOString()
    } else if (!autoInvoice) {
      autoInvoiceEnabledAt = undefined
    }

    const updatedMetadata = {
      ...currentMetadata,
      autoInvoiceEnabledAt,
      ...(downloadInvoice !== undefined ? { downloadInvoice } : {}),
      ...(autoCreditNote !== undefined ? { autoCreditNote } : {}),
      ...(autoRefund !== undefined ? { autoRefund } : {})
    }

    await db.update(marketplaceIntegrations)
      .set({ 
        autoInvoice,
        uploadInvoice,
        metadata: updatedMetadata,
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

export async function saveDocumentNumberSettingsAction(prevState: any, formData: FormData) {
  const auth = await requireAuth()

  const documentTypes = ['invoice', 'quote', 'creditNote', 'deliveryNote', 'purchaseOrder'] as const
  const settings: Record<string, any> = {}

  for (const type of documentTypes) {
    const auto = formData.get(`${type}_auto`) === 'on'
    const next = (formData.get(`${type}_next`) as string) || '1'
    const format = (formData.get(`${type}_format`) as string) || '%nummer%'
    const padding = parseInt(formData.get(`${type}_padding`) as string, 10) || 5

    settings[type] = {
      auto,
      next,
      format,
      padding,
      perContact: false
    }
  }

  try {
    const invoiceNext = settings.invoice?.next || '1'
    const deliveryNoteNext = settings.deliveryNote?.next || '1'

    await db
      .update(companies)
      .set({
        documentNumberSettings: settings,
        nextInvoiceNumber: invoiceNext,
        nextDeliveryNoteNumber: deliveryNoteNext,
        updatedAt: new Date()
      })
      .where(eq(companies.id, auth.activeCompanyId))

    revalidatePath('/settings')
    return { success: true, message: 'Dokumentennummern erfolgreich gespeichert.' }
  } catch (error) {
    console.error('Error saving document number settings:', error)
    return { success: false, message: 'Fehler beim Speichern der Einstellungen.' }
  }
}

export async function saveCompanySmtpSettingsAction(prevState: any, formData: FormData) {
  const auth = await requireAuth()
  const enabled = formData.get('enabled') === 'on'
  const host = formData.get('host') as string
  const portRaw = formData.get('port') as string
  const username = formData.get('username') as string
  const password = formData.get('password') as string
  const encryption = formData.get('encryption') as 'ssl' | 'tls' | 'none'
  const fromEmail = formData.get('fromEmail') as string
  const fromName = formData.get('fromName') as string

  const port = portRaw ? parseInt(portRaw, 10) : undefined

  try {
    const smtpSettings = {
      enabled,
      host: host || undefined,
      port: isNaN(port as any) ? undefined : port,
      username: username || undefined,
      password: password || undefined,
      encryption: encryption || undefined,
      fromEmail: fromEmail || undefined,
      fromName: fromName || undefined,
    }

    await db
      .update(companies)
      .set({
        smtpSettings,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, auth.activeCompanyId))

    revalidatePath('/settings')
    return { success: true, message: 'SMTP-Einstellungen erfolgreich gespeichert.' }
  } catch (error) {
    console.error('Error saving SMTP settings:', error)
    return { success: false, message: 'Fehler beim Speichern der SMTP-Einstellungen.' }
  }
}

export async function testSmtpConnectionAction(formData: FormData) {
  const auth = await requireAuth()
  const { getCurrentUser } = await import('@/lib/session')
  const user = await getCurrentUser()

  if (!user || !user.email) {
    return { success: false, message: 'Keine Empfänger-E-Mail-Adresse für den Test gefunden.' }
  }

  const host = formData.get('host') as string
  const portRaw = formData.get('port') as string
  const username = formData.get('username') as string
  const password = formData.get('password') as string
  const encryption = formData.get('encryption') as 'ssl' | 'tls' | 'none'
  const fromEmail = formData.get('fromEmail') as string
  const fromName = formData.get('fromName') as string

  const port = portRaw ? parseInt(portRaw, 10) : undefined

  if (!host || !fromEmail) {
    return { success: false, message: 'SMTP-Host und Absender-E-Mail sind erforderlich.' }
  }

  try {
    const nodemailer = await import('nodemailer')
    const secure = encryption === 'ssl' || port === 465

    const transporter = nodemailer.createTransport({
      host,
      port: port || 587,
      secure,
      auth: username && password ? {
        user: username,
        pass: password,
      } : undefined,
      tls: {
        rejectUnauthorized: false
      }
    })

    const from = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail

    await transporter.sendMail({
      from,
      to: user.email,
      subject: 'Test-E-Mail von TheOmniStack',
      html: `<h3>SMTP-Verbindungstest erfolgreich!</h3>
             <p>Diese E-Mail wurde gesendet, um deine SMTP-Einstellungen in TheOmniStack zu überprüfen.</p>
             <p>Absender: ${from}</p>
             <p>Server: ${host}:${port || 587} (${encryption})</p>`,
    })

    return { success: true, message: `Test-E-Mail wurde erfolgreich an ${user.email} gesendet.` }
  } catch (error: any) {
    console.error('SMTP test failed:', error)
    return { success: false, message: `Verbindung fehlgeschlagen: ${error.message || error}` }
  }
}



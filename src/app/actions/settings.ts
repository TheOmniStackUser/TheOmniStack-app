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
  const invoiceFooter = formData.get('invoiceFooter') as string
  const invoiceFooterEn = formData.get('invoiceFooterEn') as string
  const offerFooter = formData.get('offerFooter') as string
  const offerFooterEn = formData.get('offerFooterEn') as string
  const returnsNote = formData.get('returnsNote') as string
  const returnsNoteEn = formData.get('returnsNoteEn') as string
  const internationalLanguage = formData.get('internationalLanguage') as string || 'en'

  try {
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)

    if (!company) {
      return { success: false, message: 'Unternehmen nicht gefunden.' }
    }

    let emailToUpdate: string | null = company.email
    let newPendingEmail: string | null = company.newPendingEmail
    let emailVerificationToken: string | null = company.emailVerificationToken
    let emailVerifiedAt: Date | null = company.emailVerifiedAt
    let sentVerification = false

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
      await sendCompanyEmailVerificationEmail(submittedEmail, name || company.name, emailVerificationToken)
      sentVerification = true
    }

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
        email: emailToUpdate,
        newPendingEmail,
        emailVerificationToken,
        emailVerifiedAt,
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
        invoiceFooter,
        invoiceFooterEn,
        offerFooter,
        offerFooterEn,
        returnsNote,
        returnsNoteEn,
        internationalLanguage,
        updatedAt: new Date()
      })
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



'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder')

export async function cancelSubscriptionAction(formData: FormData) {
  try {
    const auth = await requireAuth()
    
    if (auth.role !== 'owner') {
      return { error: 'Nur der Besitzer (Owner) kann das Paket kündigen.' }
    }

    const category = formData.get('category') as string
    const subReason = formData.get('subReason') as string | null
    const details = formData.get('details') as string | null

    if (!category) {
      return { error: 'Bitte wähle einen Kündigungsgrund aus.' }
    }

    // Holen der Unternehmensdaten für die Berechnung des Kündigungsdatums
    const [company] = await db
      .select({ 
        name: companies.name, 
        trialExpiresAt: companies.trialExpiresAt 
      })
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)

    if (!company) {
      return { error: 'Firma nicht gefunden.' }
    }

    const now = new Date()
    let effectiveDate = new Date()
    
    if (company.trialExpiresAt && company.trialExpiresAt > now) {
      effectiveDate = company.trialExpiresAt
    } else {
      // Ende des aktuellen Monats
      effectiveDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    }

    const reason = {
      category,
      ...(subReason && { subReason }),
      ...(details && { details }),
    }

    await db.update(companies)
      .set({
        canceledAt: now,
        cancelEffectiveDate: effectiveDate,
        cancelReason: reason
      })
      .where(eq(companies.id, auth.activeCompanyId))

    // E-Mail an info@theomnistack.de
    const subject = `Kündigung: ${company.name}`
    const html = `
      <h2>Neue Kündigung</h2>
      <p><strong>Firma:</strong> ${company.name}</p>
      <p><strong>Wirksam zum:</strong> ${effectiveDate.toLocaleDateString('de-DE')}</p>
      <h3>Kündigungsgrund:</h3>
      <ul>
        <li><strong>Kategorie:</strong> ${category}</li>
        ${subReason ? \`<li><strong>Detail:</strong> \${subReason}</li>\` : ''}
        ${details ? \`<li><strong>Zusatzinfo:</strong> \${details}</li>\` : ''}
      </ul>
      <p>Eingereicht am: ${now.toLocaleString('de-DE')}</p>
    `

    const { error: emailError } = await resend.emails.send({
      from: 'TheOmniStack System <noreply@theomnistack.de>',
      to: ['info@theomnistack.de'],
      subject,
      html,
    })

    if (emailError) {
      console.error('[Cancel Subscription] Error sending notification email:', emailError)
      // Wir geben keinen Error zurück, da die Kündigung in der DB gespeichert wurde
    }

    return { success: true, effectiveDate: effectiveDate.toISOString() }
  } catch (error) {
    console.error('[Cancel Subscription] Error:', error)
    return { error: 'Ein Fehler ist aufgetreten. Bitte versuche es später noch einmal.' }
  }
}

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
    
    if (auth.role !== 'owner' && auth.role !== 'admin') {
      return { error: 'Nur der Besitzer oder Administrator kann das Paket kündigen.' }
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

    const { marketplaceIntegrations } = await import('@/db/schema/integrations')
    const { and } = await import('drizzle-orm')
    const [shopifyIntegration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.type, 'shopify')
        )
      )
      .limit(1)

    if (shopifyIntegration) {
      const metadata = (shopifyIntegration.metadata as any) || {}
      if (metadata.isShopifyBilled && metadata.shopifySubscriptionId) {
        const shop = shopifyIntegration.environment?.replace('https://', '').replace(/\/$/, '')
        const mutation = `
          mutation {
            appSubscriptionCancel(
              id: "gid://shopify/AppSubscription/${metadata.shopifySubscriptionId}"
            ) {
              appSubscription {
                id
                status
              }
              userErrors {
                field
                message
              }
            }
          }
        `
        try {
          const response = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': shopifyIntegration.accessToken || '',
            },
            body: JSON.stringify({ query: mutation })
          })
          const data = await response.json()
          if (data.errors || data.data?.appSubscriptionCancel?.userErrors?.length > 0) {
            console.error('[Shopify Billing] Error cancelling subscription:', data.errors || data.data.appSubscriptionCancel.userErrors)
            // We might still proceed with internal cancellation, or return an error. Let's proceed.
          } else {
            // Update metadata to canceled
            await db.update(marketplaceIntegrations)
              .set({
                metadata: {
                  ...metadata,
                  shopifySubscriptionStatus: 'CANCELLED'
                }
              })
              .where(eq(marketplaceIntegrations.id, shopifyIntegration.id))
          }
        } catch (e) {
          console.error('[Shopify Billing] Exception cancelling subscription:', e)
        }
      }
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
        ${subReason ? `<li><strong>Detail:</strong> ${subReason}</li>` : ''}
        ${details ? `<li><strong>Zusatzinfo:</strong> ${details}</li>` : ''}
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

export async function undoCancelSubscriptionAction() {
  try {
    const auth = await requireAuth()
    
    if (auth.role !== 'owner' && auth.role !== 'admin') {
      return { error: 'Nur der Besitzer oder Administrator kann die Kündigung aufheben.' }
    }

    const { marketplaceIntegrations } = await import('@/db/schema/integrations')
    const { and } = await import('drizzle-orm')
    const [shopifyIntegration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.type, 'shopify')
        )
      )
      .limit(1)

    if (shopifyIntegration) {
      const metadata = (shopifyIntegration.metadata as any) || {}
      if (metadata.isShopifyBilled) {
        // They need to approve a new charge before we can reactivate!
        return { redirectTo: '/api/billing/shopify/check' }
      }
    }

    await db.update(companies)
      .set({
        canceledAt: null,
        cancelEffectiveDate: null,
        cancelReason: null
      })
      .where(eq(companies.id, auth.activeCompanyId))

    return { success: true }
  } catch (error) {
    console.error('[Undo Cancel Subscription] Error:', error)
    return { error: 'Ein Fehler ist aufgetreten. Bitte versuche es später noch einmal.' }
  }
}

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

export async function GET(request: Request) {
  try {
    const auth = await requireAuth()
    const { searchParams } = new URL(request.url)
    const chargeId = searchParams.get('charge_id')
    const shopParams = searchParams.get('shop')
    const returnUrl = searchParams.get('returnUrl') || '/dashboard'

    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.type, 'shopify'),
          shopParams ? eq(marketplaceIntegrations.environment, shopParams) : undefined
        )
      )
      .limit(1)

    if (!integration || !integration.accessToken || !integration.environment) {
      return NextResponse.redirect(new URL('/integrations?error=shopify_not_found', process.env.NEXT_PUBLIC_APP_URL))
    }

    const shop = integration.environment.replace('https://', '').replace(/\/$/, '')

    if (!chargeId) {
      // User cancelled before charge ID was provided
      const metadata = (integration.metadata as any) || {}
      await db
        .update(marketplaceIntegrations)
        .set({
          metadata: {
            ...metadata,
            isShopifyBilled: true,
            shopifySubscriptionStatus: 'DECLINED'
          }
        })
        .where(eq(marketplaceIntegrations.id, integration.id))

      return NextResponse.redirect(new URL(`/subscribe?error=declined&shop=${shop}`, process.env.NEXT_PUBLIC_APP_URL))
    }

    // Verify the subscription status
    const query = `
      query {
        node(id: "gid://shopify/AppSubscription/${chargeId}") {
          ... on AppSubscription {
            id
            status
          }
        }
      }
    `

    const response = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': integration.accessToken,
      },
      body: JSON.stringify({ query })
    })

    const data = await response.json()
    const status = data.data?.node?.status

    if (status === 'ACTIVE') {
      const metadata = (integration.metadata as any) || {}
      await db.transaction(async (tx) => {
        await tx
          .update(marketplaceIntegrations)
          .set({
            metadata: {
              ...metadata,
              isShopifyBilled: true,
              shopifySubscriptionId: chargeId,
              shopifySubscriptionStatus: 'ACTIVE'
            }
          })
          .where(eq(marketplaceIntegrations.id, integration.id))
          
        const { companies } = await import('@/db/schema/companies')
        await tx
          .update(companies)
          .set({
            canceledAt: null,
            cancelEffectiveDate: null,
            cancelReason: null
          })
          .where(eq(companies.id, auth.activeCompanyId))
      })
      
      return NextResponse.redirect(new URL(returnUrl, process.env.NEXT_PUBLIC_APP_URL))
    } else {
      // The user declined the charge or it failed
      const metadata = (integration.metadata as any) || {}
      await db
        .update(marketplaceIntegrations)
        .set({
          metadata: {
            ...metadata,
            isShopifyBilled: true,
            shopifySubscriptionId: chargeId,
            shopifySubscriptionStatus: 'DECLINED'
          }
        })
        .where(eq(marketplaceIntegrations.id, integration.id))

      return NextResponse.redirect(new URL(`/subscribe?error=declined&shop=${shop}`, process.env.NEXT_PUBLIC_APP_URL))
    }
  } catch (error) {
    console.error('[Shopify Billing Callback] Error:', error)
    return NextResponse.redirect(new URL('/subscribe?error=internal_billing_error', process.env.NEXT_PUBLIC_APP_URL))
  }
}

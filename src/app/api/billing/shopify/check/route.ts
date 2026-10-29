import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

export async function GET(request: Request) {
  try {
    const auth = await requireAuth()
    const { searchParams } = new URL(request.url)
    const shopParams = searchParams.get('shop')

    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.type, 'shopify')
        )
      )
      .limit(1)

    // If there is no shop parameter, just use the integration's shop
    const shop = shopParams || (integration?.environment ? integration.environment.replace('https://', '').replace(/\/$/, '') : null)

    const clientId = process.env.SHOPIFY_CLIENT_ID
    const defaultRedirect = (shop && clientId) 
      ? `https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/apps/${clientId}`
      : `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`

    if (!integration || !shop || !integration.accessToken) {
      return NextResponse.redirect(defaultRedirect)
    }

    const metadata = (integration.metadata as any) || {}

    // Verify subscription status in real-time using Shopify's GraphQL API (source of truth)
    let hasActiveSubscription = false
    let activeSubscriptionId: string | null = null

    try {
      const activeSubsQuery = `
        query {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
              status
            }
          }
        }
      `
      const shopifyRes = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': integration.accessToken,
        },
        body: JSON.stringify({ query: activeSubsQuery }),
        cache: 'no-store'
      })

      if (shopifyRes.ok) {
        const resData = await shopifyRes.json()
        const activeSubs = resData.data?.currentAppInstallation?.activeSubscriptions || []
        const activeSub = activeSubs.find((s: any) => s.status === 'ACTIVE')
        if (activeSub) {
          hasActiveSubscription = true
          activeSubscriptionId = activeSub.id.split('/').pop() || null
        }
      }
    } catch (apiErr) {
      console.error('[Shopify Billing Check] Error querying active subscriptions:', apiErr)
    }

    if (hasActiveSubscription) {
      // Merchant has an active subscription in Shopify. Update local DB and allow access.
      await db
        .update(marketplaceIntegrations)
        .set({
          metadata: {
            ...metadata,
            isShopifyBilled: true,
            shopifySubscriptionId: activeSubscriptionId || metadata.shopifySubscriptionId,
            shopifySubscriptionStatus: 'ACTIVE'
          }
        })
        .where(eq(marketplaceIntegrations.id, integration.id))

      return NextResponse.redirect(defaultRedirect)
    }

    // No active subscription found on Shopify!
    // If the charge was previously declined, send to /subscribe paywall page without auto-restarting
    if (metadata.shopifySubscriptionStatus === 'DECLINED') {
      return NextResponse.redirect(new URL(`/subscribe?error=declined&shop=${shop}`, process.env.NEXT_PUBLIC_APP_URL))
    }

    // Otherwise, mark as PENDING and initiate the charge approval flow
    await db
      .update(marketplaceIntegrations)
      .set({
        metadata: {
          ...metadata,
          isShopifyBilled: true,
          shopifySubscriptionStatus: 'PENDING'
        }
      })
      .where(eq(marketplaceIntegrations.id, integration.id))

    return NextResponse.redirect(new URL(`/api/billing/shopify/start?returnUrl=${encodeURIComponent(defaultRedirect)}`, process.env.NEXT_PUBLIC_APP_URL))
  } catch (error) {
    console.error('[Shopify Billing Check] Error:', error)
    return NextResponse.redirect(new URL('/subscribe?error=internal_billing_check_error', process.env.NEXT_PUBLIC_APP_URL))
  }
}

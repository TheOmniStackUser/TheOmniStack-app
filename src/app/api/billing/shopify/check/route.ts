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

    if (!integration) {
      return NextResponse.redirect(defaultRedirect)
    }

    const metadata = (integration.metadata as any) || {}

    // 1. Is this a new user from the Shopify App Store?
    if (metadata.isShopifyBilled) {
      // 2. Do they already have an active subscription?
      if (metadata.shopifySubscriptionStatus !== 'ACTIVE') {
        // They need to pay! Redirect to start billing flow.
        return NextResponse.redirect(new URL(`/api/billing/shopify/start?returnUrl=${encodeURIComponent(defaultRedirect)}`, process.env.NEXT_PUBLIC_APP_URL))
      }
    }

    // Existing customer OR already paid. Redirect to app.
    return NextResponse.redirect(defaultRedirect)
  } catch (error) {
    console.error('[Shopify Billing Check] Error:', error)
    return NextResponse.redirect(new URL('/dashboard?error=internal_billing_check_error', process.env.NEXT_PUBLIC_APP_URL))
  }
}

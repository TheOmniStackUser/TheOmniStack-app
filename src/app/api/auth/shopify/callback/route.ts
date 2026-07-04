import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { and, eq } from 'drizzle-orm'

export async function GET(request: Request) {
  try {
    // 1. Check if user is authenticated (they might not be if installing directly from App Store)
    const { getSession, setShopifyPendingInstall } = await import('@/lib/session')
    const payload = await getSession()
    const companyId = payload?.activeCompanyId

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const hmac = searchParams.get('hmac')
    const shop = searchParams.get('shop')
    const state = searchParams.get('state')

    if (!code || !hmac || !shop || !state) {
      return NextResponse.redirect(new URL('/integrations?error=missing_shopify_params', (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')))
    }

    // 2. Verify State (CSRF Protection) using our securely set cookie
    const cookieStore = await cookies()
    const storedNonce = cookieStore.get('shopify_oauth_nonce')?.value

    if (!storedNonce || storedNonce !== state) {
      return NextResponse.redirect(new URL('/integrations?error=invalid_oauth_state', (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')))
    }

    // 3. Verify HMAC signature to ensure request came authenticly from Shopify
    const secret = process.env.SHOPIFY_CLIENT_SECRET
    if (!secret) throw new Error('Missing SHOPIFY_CLIENT_SECRET in environment')

    // Remove hmac from params to calculate the signature over the rest
    const paramsForSignature = new URLSearchParams(searchParams.toString())
    paramsForSignature.delete('hmac')
    
    // Shopify requires lexicographical sorting of parameters for the HMAC
    const sortedParams = Array.from(paramsForSignature.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&')

    const generatedHash = crypto
      .createHmac('sha256', secret)
      .update(sortedParams)
      .digest('hex')

    if (generatedHash !== hmac) {
      return NextResponse.redirect(new URL('/integrations?error=invalid_hmac_signature', (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')))
    }

    // 4. Exchange the temporary code for a permanent access token
    const tokenBody = new URLSearchParams({
      client_id: process.env.SHOPIFY_CLIENT_ID || '',
      client_secret: secret,
      code,
      expiring: '1'
    })

    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody
    })

    if (!tokenResponse.ok) {
      return NextResponse.redirect(new URL('/integrations?error=shopify_token_exchange_failed', (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')))
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token
    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null

    // 4.5 Make an API call to Shopify to satisfy "App must use Shopify API" requirement
    let shopMetadata = {}
    try {
      const shopRes = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        }
      })
      if (shopRes.ok) {
        const shopData = await shopRes.json()
        shopMetadata = shopData.shop || {}
        console.log('[Shopify OAuth] Fetched shop data:', shopMetadata)
      }
    } catch (e) {
      console.error('[Shopify OAuth] Failed to fetch shop data during install:', e)
    }

    // 5. Save the token
    if (companyId) {
      // User is logged in and has a company, save directly to Database
      const [existing] = await db
        .select()
        .from(marketplaceIntegrations)
        .where(
          and(
            eq(marketplaceIntegrations.companyId, companyId),
            eq(marketplaceIntegrations.type, 'shopify')
          )
        )

      if (existing) {
        await db
          .update(marketplaceIntegrations)
          .set({
            environment: shop, // Store the shop domain here (e.g. "my-shop.myshopify.com")
            accessToken: accessToken,
            refreshToken: refreshToken || null,
            expiresAt: expiresAt || null,
            isActive: true,
            updatedAt: new Date(),
            metadata: { ...((existing.metadata as any) || {}), shop: shopMetadata }
          })
          .where(eq(marketplaceIntegrations.id, existing.id))
      } else {
        await db.insert(marketplaceIntegrations).values({
          companyId,
          type: 'shopify',
          environment: shop,
          accessToken: accessToken,
          refreshToken: refreshToken || null,
          expiresAt: expiresAt || null,
          isActive: true,
          metadata: { shop: shopMetadata }
        })
      }

      // 5.5 Register Webhooks
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const webhookUrl = appUrl.startsWith('http://localhost')
        ? appUrl.replace('http', 'https') + '/api/webhooks/shopify/events'
        : `${appUrl}/api/webhooks/shopify/events`

      const webhookTopics = ['orders/create', 'orders/updated', 'products/create', 'products/update']
      
      for (const topic of webhookTopics) {
        try {
          const webhookRes = await fetch(`https://${shop}/admin/api/2024-01/webhooks.json`, {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              webhook: {
                topic,
                address: webhookUrl,
                format: 'json'
              }
            })
          })
          if (!webhookRes.ok) {
            const errText = await webhookRes.text()
            console.error(`[Shopify OAuth] Failed to register webhook for ${topic}:`, errText)
          } else {
            console.log(`[Shopify OAuth] Successfully registered webhook for ${topic}`)
          }
        } catch (e) {
          console.error(`[Shopify OAuth] Error registering webhook for ${topic}:`, e)
        }
      }

      // 5.6 Trigger Initial Sync
      try {
        const { marketplaceSyncQueue } = await import('@/workers/marketplace-sync')
        const [insertedOrUpdated] = await db
          .select()
          .from(marketplaceIntegrations)
          .where(
            and(
              eq(marketplaceIntegrations.companyId, companyId),
              eq(marketplaceIntegrations.type, 'shopify')
            )
          )
          .limit(1)

        if (insertedOrUpdated) {
          await marketplaceSyncQueue.add(
            `sync-shopify`,
            {
              companyId,
              marketplace: 'shopify',
              triggeredByUserId: null,
              integrationId: insertedOrUpdated.id,
              marketplaceDisplayName: 'Shopify',
            },
            {
              jobId: `sync-shopify-${companyId}-${Date.now()}`
            }
          )
          console.log(`[Shopify OAuth] Initial data sync triggered for company ${companyId}`)
        }
      } catch (e) {
        console.error('[Shopify OAuth] Failed to trigger initial sync:', e)
      }

      // 6. Cleanup CSRF cookie and redirect to Shopify Admin (Shopify App Review Requirement)
      cookieStore.delete('shopify_oauth_nonce')
      const clientId = process.env.SHOPIFY_CLIENT_ID
      const redirectUrl = clientId 
        ? `https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/apps/${clientId}`
        : `${(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')}/integrations?success=shopify_connected`
        
      return NextResponse.redirect(redirectUrl)
    } else {
      // User is NOT logged in. Save pending install to secure cookie and redirect to registration.
      await setShopifyPendingInstall({
        shop,
        accessToken,
        shopMetadata
      })
      
      cookieStore.delete('shopify_oauth_nonce')
      return NextResponse.redirect(new URL('/register?source=shopify', (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')))
    }

  } catch (error) {
    console.error('[Shopify OAuth Error]', error)
    return NextResponse.redirect(new URL('/integrations?error=internal_server_error', (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')))
  }
}

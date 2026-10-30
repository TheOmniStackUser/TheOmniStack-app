import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { orders } from '@/db/schema/orders'
import { eq, and } from 'drizzle-orm'
import { marketplaceSyncQueue } from '@/workers/marketplace-sync'

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256')
    const topic = request.headers.get('x-shopify-topic')
    const shopDomain = request.headers.get('x-shopify-shop-domain')

    if (!hmacHeader || !topic || !shopDomain) {
      return new NextResponse('Missing required headers', { status: 400 })
    }

    const secret = process.env.SHOPIFY_CLIENT_SECRET
    if (!secret) {
      console.error('[Shopify Webhook Error] Missing SHOPIFY_CLIENT_SECRET')
      return new NextResponse('Internal Server Error', { status: 500 })
    }

    const generatedHash = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64')

    if (generatedHash !== hmacHeader) {
      console.warn(`[Shopify Webhook] Invalid HMAC for topic: ${topic} from ${shopDomain}`)
      return new NextResponse('Unauthorized', { status: 401 })
    }

    console.log(`[Shopify Webhook] Received ${topic} from ${shopDomain}`)

    // Handle app uninstallation immediately
    if (topic === 'app/uninstalled') {
      console.log(`[Shopify Webhook] Processing app/uninstalled for shop: ${shopDomain}`)
      const matchingIntegrations = await db
        .select()
        .from(marketplaceIntegrations)
        .where(
          and(
            eq(marketplaceIntegrations.type, 'shopify'),
            eq(marketplaceIntegrations.environment, shopDomain)
          )
        )

      for (const row of matchingIntegrations) {
        const existingMeta = (row.metadata as any) || {}
        await db
          .update(marketplaceIntegrations)
          .set({
            isActive: false,
            accessToken: null,
            refreshToken: null,
            expiresAt: null,
            metadata: {
              ...existingMeta,
              uninstalledAt: new Date().toISOString(),
              isShopifyBilled: false,
              shopifySubscriptionStatus: 'CANCELLED',
            },
            updatedAt: new Date(),
          })
          .where(eq(marketplaceIntegrations.id, row.id))
      }

      console.log(`[Shopify Webhook] Successfully uninstalled and deactivated integration for shop: ${shopDomain}`)
      return new NextResponse('OK', { status: 200 })
    }

    // Find the company associated with this shop
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.type, 'shopify'),
          eq(marketplaceIntegrations.environment, shopDomain),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
      .limit(1)

    if (!integration) {
      console.warn(`[Shopify Webhook] No active integration found for shop: ${shopDomain}`)
      return new NextResponse('OK', { status: 200 }) // Return 200 so Shopify stops retrying
    }

    // Handle direct order updates for existing records (e.g. cancellations, fulfillments)
    if (topic.startsWith('orders/')) {
      try {
        const orderData = JSON.parse(rawBody)
        if (orderData?.id) {
          const shopifyOrderId = orderData.id.toString()
          if (topic === 'orders/cancelled' || orderData.cancelled_at) {
            await db
              .update(orders)
              .set({ status: 'cancelled', updatedAt: new Date() })
              .where(
                and(
                  eq(orders.companyId, integration.companyId),
                  eq(orders.marketplace, 'shopify'),
                  eq(orders.marketplaceOrderId, shopifyOrderId)
                )
              )
            console.log(`[Shopify Webhook] Marked order ${shopifyOrderId} as cancelled for company ${integration.companyId}`)
          } else if (topic === 'orders/fulfilled' || orderData.fulfillment_status === 'fulfilled') {
            const trackingNumber =
              orderData.fulfillments?.[0]?.tracking_number ||
              orderData.fulfillments?.[0]?.tracking_numbers?.[0] ||
              null
            const updatePayload: any = { status: 'shipped', updatedAt: new Date() }
            if (trackingNumber) {
              updatePayload.trackingNumber = trackingNumber
            }
            await db
              .update(orders)
              .set(updatePayload)
              .where(
                and(
                  eq(orders.companyId, integration.companyId),
                  eq(orders.marketplace, 'shopify'),
                  eq(orders.marketplaceOrderId, shopifyOrderId)
                )
              )
            console.log(`[Shopify Webhook] Marked order ${shopifyOrderId} as shipped for company ${integration.companyId}`)
          }
        }
      } catch (err) {
        console.warn(`[Shopify Webhook] Failed to parse order JSON payload for topic ${topic}:`, err)
      }
    }

    // Determine what to do based on the topic
    if (topic.startsWith('orders/') || topic.startsWith('products/')) {
      // Enqueue a sync job for this company
      // Using a somewhat debounced JobID (rounded to nearest 10 seconds) to avoid spam
      const timeBucket = Math.floor(Date.now() / 10000)
      const jobId = `sync-shopify-webhook-${integration.id}-${timeBucket}`
      const shopDisplayName = (integration.metadata as any)?.shop?.name 
        ? `Shopify (${(integration.metadata as any).shop.name})` 
        : `Shopify (${shopDomain})`

      await marketplaceSyncQueue.add(
        `sync-shopify-webhook`,
        {
          companyId: integration.companyId,
          marketplace: 'shopify',
          triggeredByUserId: null,
          integrationId: integration.id,
          marketplaceDisplayName: shopDisplayName,
          isWebhook: true,
        },
        {
          jobId, // This acts as a debounce within the 10-second window
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }
      )
      console.log(`[Shopify Webhook] Enqueued sync job for company ${integration.companyId} (topic: ${topic})`)
    } else {
      console.log(`[Shopify Webhook] Ignored topic: ${topic}`)
    }

    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('[Shopify Webhook Error]', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

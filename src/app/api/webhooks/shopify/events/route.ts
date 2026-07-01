import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
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

    // Determine what to do based on the topic
    if (topic.startsWith('orders/') || topic.startsWith('products/')) {
      // Enqueue a sync job for this company
      // Using a somewhat debounced JobID (rounded to nearest 10 seconds) to avoid spam
      const timeBucket = Math.floor(Date.now() / 10000)
      const jobId = `sync-shopify-webhook-${integration.companyId}-${timeBucket}`

      await marketplaceSyncQueue.add(
        `sync-shopify`,
        {
          companyId: integration.companyId,
          marketplace: 'shopify',
          triggeredByUserId: null,
          integrationId: integration.id,
          marketplaceDisplayName: 'Shopify',
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

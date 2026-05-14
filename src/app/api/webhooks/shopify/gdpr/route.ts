import { NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * Shopify Mandatory GDPR Webhooks
 * 
 * To submit an app for review, these three endpoints must be implemented.
 * They handle data requests and deletions according to GDPR.
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const hmac = request.headers.get('x-shopify-hmac-sha256')
    const topic = request.headers.get('x-shopify-topic')
    const shopDomain = request.headers.get('x-shopify-shop-domain')

    // 1. Verify that the request actually comes from Shopify
    const secret = process.env.SHOPIFY_CLIENT_SECRET
    if (!secret) {
      return new NextResponse('Internal Server Error: Missing Secret', { status: 500 })
    }

    const generatedHash = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64')

    if (generatedHash !== hmac) {
      console.warn(`[Shopify Webhook] Invalid HMAC for topic: ${topic} from ${shopDomain}`)
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const data = JSON.parse(rawBody)
    console.log(`[Shopify Webhook] Received ${topic} from ${shopDomain}:`, data)

    /**
     * Handle the specific GDPR topics
     * Note: For the initial app review, it is often enough to log these and return 200 OK.
     * In a real production app, you should actually delete/provide the requested data.
     */
    switch (topic) {
      case 'customers/data_request':
        // A customer requested their data. Shopify asks us to provide it.
        // We log it here. In a full implementation, you'd send this to the shop owner or customer.
        break
      
      case 'customers/redact':
        // A customer requested to be forgotten. Delete their PII from your database.
        break
      
      case 'shop/redact':
        // A shop uninstalled your app or requested deletion. Delete all shop-related data.
        break
      
      default:
        console.warn(`[Shopify Webhook] Unhandled GDPR topic: ${topic}`)
    }

    // Always return 200 OK to Shopify within 5 seconds
    return new NextResponse('OK', { status: 200 })

  } catch (error) {
    console.error('[Shopify Webhook Error]', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

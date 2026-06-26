import { db } from '../db/client'
import { orders } from '../db/schema'
import { lt, and, eq } from 'drizzle-orm'

async function purgeAmazonPII() {
  console.log('[Amazon PII Purge] Starting automated 30-day data retention purge...')
  
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  try {
    const result = await db.update(orders)
      .set({
        buyerName: '[Anonymisiert]',
        buyerEmail: '[Anonymisiert]',
        shippingName: '[Anonymisiert]',
        shippingStreet: '[Anonymisiert]',
        shippingCity: '[Anonymisiert]',
        shippingZip: '[Anonymisiert]',
        rawPayload: {} // Purge raw payload which contains raw PII
      })
      .where(
        and(
          eq(orders.marketplace, 'amazon'),
          lt(orders.createdAt, thirtyDaysAgo)
        )
      )
      
    console.log(`[Amazon PII Purge] Successfully purged PII for Amazon orders older than 30 days.`)
    process.exit(0)
  } catch (error) {
    console.error('[Amazon PII Purge] Error during purge:', error)
    process.exit(1)
  }
}

purgeAmazonPII()

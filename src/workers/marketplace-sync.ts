// ============================================================================
// BULLMQ WORKER — Marketplace Sync Engine
// Processes jobs enqueued by the sync API route.
// This file is meant to run as a separate Node.js process (or serverless worker).
// ============================================================================

import { Worker, Queue, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { companies } from '@/db/schema/companies'
import { vatSettings } from '@/db/schema/vat-settings'
import { auditLog } from '@/lib/audit'
import { eq, and } from 'drizzle-orm'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { OttoAdapter } from '@/adapters/marketplace/otto'
import { MiraklAdapter } from '@/adapters/marketplace/mirakl'
import { AmazonAdapter } from '@/adapters/marketplace/amazon'
import { AboutYouAdapter } from '@/adapters/marketplace/aboutyou'
import { ShopifyAdapter } from '@/adapters/marketplace/shopify'
import type { NormalizedOrder, MarketplaceAdapter } from '@/adapters/marketplace/base'
import { createInvoiceForOrder } from '@/lib/invoice-service'

// ─── Queue Name Constants ─────────────────────────────────────────────────────
export const QUEUE_MARKETPLACE_SYNC = 'marketplace-sync'

export type MarketplaceSyncJobData = {
  companyId: string
  marketplace: NormalizedOrder['marketplace']
  triggeredByUserId: string
  fromDate?: string
  toDate?: string
}

// ─── Redis Connection ─────────────────────────────────────────────────────────
const redisConnection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Required by BullMQ
})
redisConnection.on('error', (err) => {
  console.error('[Redis Error in marketplace-sync]', err)
})

// ─── Queue ────────────────────────────────────────────────────────────────────
export const marketplaceSyncQueue = new Queue<MarketplaceSyncJobData>(
  QUEUE_MARKETPLACE_SYNC,
  { 
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  }
)

// ─── Worker ───────────────────────────────────────────────────────────────────
export function createMarketplaceSyncWorker() {
  return new Worker<MarketplaceSyncJobData>(
    QUEUE_MARKETPLACE_SYNC,
    async (job: Job<MarketplaceSyncJobData>) => {
      const { companyId, marketplace, triggeredByUserId } = job.data

      await auditLog({
        companyId,
        userId: triggeredByUserId,
        action: 'sync_start',
        entityType: 'marketplace_sync',
        entityId: marketplace,
        nextState: { marketplace, startedAt: new Date().toISOString() },
      })

      try {
        // Fetch credentials from the database
        const [integration] = await db
          .select()
          .from(marketplaceIntegrations)
          .where(
            and(
              eq(marketplaceIntegrations.companyId, companyId),
              eq(marketplaceIntegrations.type, marketplace),
              eq(marketplaceIntegrations.isActive, true)
            )
          )
          .limit(1)

        if (!integration) {
          throw new Error(`No active integration found for ${marketplace}`)
        }

        let rawOrders: NormalizedOrder[] = []
        let adapter: MarketplaceAdapter | null = null

        if (marketplace === 'otto') {
          if (!integration.clientId || !integration.clientSecret) {
            throw new Error('Otto integration is missing clientId or clientSecret')
          }
          adapter = new OttoAdapter({
            clientId: integration.clientId,
            clientSecret: integration.clientSecret,
            environment: (integration.environment as 'sandbox' | 'production') || 'production',
            installationId: (integration.metadata as any)?.installationId,
            appId: (integration.metadata as any)?.appId
          })
          rawOrders = await adapter.fetchUnshippedOrders(companyId, {
            fromDate: job.data.fromDate,
            toDate: job.data.toDate
          })
        } else if (
          marketplace === 'mirakl_decathlon' ||
          marketplace === 'mirakl_decathlon_eu' ||
          marketplace === 'mirakl_mediamarkt'
        ) {
          if (!integration.clientId) {
            throw new Error(`${marketplace} integration is missing Client ID (or API Key)`)
          }
          adapter = new MiraklAdapter({
            instance: marketplace,
            baseUrl: integration.environment!,
            clientId: integration.clientId,
            clientSecret: integration.clientSecret || '',
            apiKey: integration.apiKey || undefined
          })
          rawOrders = await adapter.fetchUnshippedOrders(companyId, {
            fromDate: job.data.fromDate,
            toDate: job.data.toDate
          })
        } else if (marketplace === 'amazon') {
          if (!integration.sellerId || !integration.clientId || !integration.clientSecret || !integration.refreshToken) {
            throw new Error('Amazon integration is missing required credentials')
          }
          adapter = new AmazonAdapter({
            sellerId: integration.sellerId,
            clientId: integration.clientId,
            clientSecret: integration.clientSecret,
            refreshToken: integration.refreshToken
          })
          rawOrders = await adapter.fetchUnshippedOrders(companyId)
        } else if (marketplace === 'shopify') {
          if (!integration.environment || !integration.clientId || !integration.clientSecret) {
            throw new Error('Shopify integration is missing required credentials (URL, Client ID, Client Secret)')
          }
          adapter = new ShopifyAdapter()
          rawOrders = await adapter.fetchUnshippedOrders(companyId, {
            fromDate: job.data.fromDate,
            toDate: job.data.toDate
          })
        } else if (marketplace === 'aboutyou') {
          if (!integration.apiKey) {
            throw new Error('About You integration is missing API Key')
          }
          adapter = new AboutYouAdapter({
            apiKey: integration.apiKey,
            environment: (integration.environment as 'sandbox' | 'production') || 'production'
          })
          rawOrders = await adapter.fetchUnshippedOrders(companyId, {
            fromDate: job.data.fromDate,
            toDate: job.data.toDate
          })
        } else {
          throw new Error(`Adapter for ${marketplace} is not fully implemented yet`)
        }

        if (rawOrders.length > 0) {
          const isManualSync = job.name.startsWith('manual-sync')
          await persistOrders(companyId, rawOrders, isManualSync, integration, adapter)
        }

        await auditLog({
          companyId,
          userId: triggeredByUserId,
          action: 'sync_complete',
          entityType: 'marketplace_sync',
          entityId: marketplace,
          nextState: { marketplace, completedAt: new Date().toISOString(), ordersImported: rawOrders.length },
        })
      } catch (error) {
        await auditLog({
          companyId,
          userId: triggeredByUserId,
          action: 'sync_error',
          entityType: 'marketplace_sync',
          entityId: marketplace,
          nextState: {
            marketplace,
            error: error instanceof Error ? error.message : String(error),
          },
        })
        throw error // Re-throw so BullMQ marks the job as failed and retries
      }
    },
    {
      connection: redisConnection,
      concurrency: 5,
    }
  )
}

// ─── Persist Orders ───────────────────────────────────────────────────────────
/**
 * Upsert normalized orders into the database.
 * Uses (companyId, marketplaceOrderId) as the idempotency key.
 */
export async function persistOrders(
  companyId: string,
  normalizedOrders: NormalizedOrder[],
  isManualSync: boolean = false,
  integration?: any,
  adapter?: MarketplaceAdapter | null
): Promise<{ checked: number, affected: number }> {
  let affected = 0

  for (const order of normalizedOrders) {
    // ── Step 1: Check if order already exists ──────────────────────────────
    const existingOrder = await db.query.orders.findFirst({
      where: and(
        eq(orders.companyId, companyId),
        eq(orders.marketplaceOrderId, order.marketplaceOrderId)
      )
    })

    if (existingOrder) {
      // Restore archived order if manual sync
      if (isManualSync && existingOrder.isArchived) {
        await db.update(orders)
          .set({ isArchived: false })
          .where(eq(orders.id, existingOrder.id))
        affected++
      }

      // If order exists but has no invoice and autoInvoice is on → generate it
      if (integration?.autoInvoice && !existingOrder.invoiceId) {
        console.log(`[Worker] Existing order ${order.marketplaceOrderId} has no invoice. Generating...`)
        try {
          const invResult = await createInvoiceForOrder(existingOrder.id, companyId)
          if (invResult && 'pdfBuffer' in invResult && integration.uploadInvoice && adapter?.uploadInvoice) {
            await adapter.uploadInvoice(
              order.marketplaceOrderId,
              invResult.pdfBuffer,
              `${invResult.invoiceNumber}.pdf`
            )
          }
        } catch (invError) {
          console.error(`[Worker] Error generating invoice for existing order ${order.marketplaceOrderId}:`, invError)
        }
      }
      // Skip the rest (don't re-insert)
      continue
    }

    // ── Step 2: It's a new order — insert it in a transaction ─────────────
    let newOrderId: string | null = null

    await db.transaction(async (tx) => {
      // Determine Customer Number
      let customerNumber: string | null = null
      if (order.buyer.email) {
        const prevOrder = await tx.query.orders.findFirst({
          where: and(
            eq(orders.companyId, companyId),
            eq(orders.buyerEmail, order.buyer.email)
          ),
          columns: { customerNumber: true }
        })
        if (prevOrder?.customerNumber) {
          customerNumber = prevOrder.customerNumber
        }
      }

      if (!customerNumber) {
        const [comp] = await tx
          .select({ nextCustomerNumber: companies.nextCustomerNumber })
          .from(companies)
          .where(eq(companies.id, companyId))
        customerNumber = comp.nextCustomerNumber
        const nextVal = (parseInt(customerNumber) + 1).toString()
        await tx.update(companies).set({ nextCustomerNumber: nextVal }).where(eq(companies.id, companyId))
      }

      // Determine Delivery Note Number
      const [compDN] = await tx
        .select({ nextDeliveryNoteNumber: companies.nextDeliveryNoteNumber })
        .from(companies)
        .where(eq(companies.id, companyId))
      const deliveryNoteNumber = compDN.nextDeliveryNoteNumber
      const nextDN = (parseInt(deliveryNoteNumber) + 1).toString()
      await tx.update(companies).set({ nextDeliveryNoteNumber: nextDN }).where(eq(companies.id, companyId))

      // Lookup VAT Settings
      const countryVat = await tx.query.vatSettings.findFirst({
        where: and(
          eq(vatSettings.companyId, companyId),
          eq(vatSettings.countryCode, order.shippingAddress.country.toUpperCase())
        )
      })

      let finalTaxAmount = order.taxAmount
      if (countryVat) {
        const rate = parseFloat(countryVat.vatRate)
        finalTaxAmount = order.items.reduce((sum, item) => {
          const gross = item.unitPrice * item.quantity
          const net = gross / (1 + rate)
          return sum + (gross - net)
        }, 0)
      }

      // Insert Order
      const [inserted] = await tx
        .insert(orders)
        .values({
          companyId,
          marketplace: order.marketplace,
          marketplaceOrderId: order.marketplaceOrderId,
          marketplacePurchaseDate: order.purchaseDate,
          buyerName: order.buyer.name,
          buyerEmail: order.buyer.email,
          shippingName: order.shippingAddress.name,
          shippingStreet: order.shippingAddress.street,
          shippingCity: order.shippingAddress.city,
          shippingZip: order.shippingAddress.zip,
          shippingCountry: order.shippingAddress.country,
          currency: order.currency,
          totalAmount: String(order.totalAmount),
          taxAmount: String(finalTaxAmount.toFixed(2)),
          totalWeight: order.totalWeight ? String(order.totalWeight) : null,
          rawPayload: order.rawPayload,
          status: 'pending',
          customerNumber,
          deliveryNoteNumber,
        })
        .returning({ id: orders.id })

      if (!inserted) return
      newOrderId = inserted.id
      affected++

      // Insert Order Items
      if (order.items.length > 0) {
        await tx.insert(orderItems).values(
          order.items.map((item) => {
            const rate = countryVat ? parseFloat(countryVat.vatRate) : 0.19
            const gross = item.unitPrice
            const net = gross / (1 + rate)
            
            return {
              orderId: inserted.id,
              companyId,
              sku: item.sku || 'N/A',
              asin: item.asin || null,
              title: item.title,
              quantity: item.quantity.toString(),
              unitPrice: net.toFixed(4), // Store with more precision to avoid rounding errors
              taxRate: rate.toString(),
            }
          })
        )
      }
    })

    // ── Step 3: Generate invoice AFTER the transaction is committed ────────
    // This avoids holding a DB lock during expensive PDF generation + S3 upload.
    if (integration?.autoInvoice && newOrderId) {
      try {
        console.log(`[Worker] Auto-generating invoice for new order ${order.marketplaceOrderId}...`)
        const invResult = await createInvoiceForOrder(newOrderId, companyId)
        if (invResult && 'pdfBuffer' in invResult && integration.uploadInvoice && adapter?.uploadInvoice) {
          console.log(`[Worker] Auto-uploading invoice for order ${order.marketplaceOrderId}...`)
          await adapter.uploadInvoice(
            order.marketplaceOrderId,
            invResult.pdfBuffer,
            `${invResult.invoiceNumber}.pdf`
          )
        }
      } catch (invError) {
        console.error(`[Worker] Error during auto-invoice for order ${order.marketplaceOrderId}:`, invError)
      }
    }
  }

  return { checked: normalizedOrders.length, affected }
}

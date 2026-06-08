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
import { eq, and, desc, isNull, inArray, gte, sql } from 'drizzle-orm'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { invoices, invoiceItems, invoiceLogs } from '@/db/schema/invoices'
import { returnsLog, returnedItems } from '@/db/schema/returns'
import { products } from '@/db/schema/products'
import { pushUpdatesToMarketplaces } from '@/workers/product-sync'
import { buildInvoiceKey, buildDeliveryNoteKey, documentExists, uploadDocument } from '@/lib/storage'
import { OttoAdapter } from '@/adapters/marketplace/otto'
import { MiraklAdapter } from '@/adapters/marketplace/mirakl'
import { AmazonAdapter } from '@/adapters/marketplace/amazon'
import { AboutYouAdapter } from '@/adapters/marketplace/aboutyou'
import { ShopifyAdapter } from '@/adapters/marketplace/shopify'
import { KauflandAdapter } from '@/adapters/marketplace/kaufland'
import { EbayAdapter } from '@/adapters/marketplace/ebay'
import { WooCommerceAdapter } from '@/adapters/marketplace/woocommerce'
import { ShopwareAdapter } from '@/adapters/marketplace/shopware'
import type { NormalizedOrder, MarketplaceAdapter } from '@/adapters/marketplace/base'
import { createInvoiceForOrder, formatDocumentNumber, getDefaultSettings, extractPaymentInfo } from '@/lib/invoice-service'
import { get2LetterCountryCode } from '@/lib/countries'

// ─── Queue Name Constants ─────────────────────────────────────────────────────
export const QUEUE_MARKETPLACE_SYNC = process.env.NODE_ENV === 'production' ? 'marketplace-sync' : 'marketplace-sync-dev'

export type MarketplaceSyncJobData = {
  companyId: string
  marketplace?: NormalizedOrder['marketplace'] | null
  triggeredByUserId?: string | null
  fromDate?: string
  toDate?: string
  integrationId?: string | null
  isInvoiceSync?: boolean
}

// ─── Lazy Redis Connection & Queue Initialization ─────────────────────────────
let _redisConnection: IORedis | null = null
function getRedisConnection(): IORedis {
  if (!_redisConnection) {
    _redisConnection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // Required by BullMQ
    })
    _redisConnection.on('error', (err) => {
      console.error('[Redis Error in marketplace-sync]', err)
    })
  }
  return _redisConnection
}

let _queue: Queue | null = null
export const marketplaceSyncQueue = new Proxy({} as Queue<MarketplaceSyncJobData>, {
  get(target, prop, receiver) {
    if (!_queue) {
      _queue = new Queue<MarketplaceSyncJobData>(
        QUEUE_MARKETPLACE_SYNC,
        { 
          connection: getRedisConnection(),
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        }
      )
    }
    const val = Reflect.get(_queue, prop)
    if (typeof val === 'function') {
      return val.bind(_queue)
    }
    return val
  }
})

// ─── Worker ───────────────────────────────────────────────────────────────────
export function createMarketplaceSyncWorker() {
  return new Worker<MarketplaceSyncJobData>(
    QUEUE_MARKETPLACE_SYNC,
    async (job: Job<MarketplaceSyncJobData>) => {
      const { companyId, marketplace, triggeredByUserId } = job.data

      if (job.name === 'daily-marketplace-sync') {
        // Fetch company config
        const [company] = await db
          .select({
            fetchOrdersDaily: companies.fetchOrdersDaily,
            fetchOrdersMarketplaces: companies.fetchOrdersMarketplaces,
          })
          .from(companies)
          .where(eq(companies.id, companyId))
          .limit(1)

        if (!company || !company.fetchOrdersDaily || !company.fetchOrdersMarketplaces || company.fetchOrdersMarketplaces.length === 0) {
          return { success: true, message: 'Daily sync is disabled or no marketplaces configured.' }
        }

        // Fetch all active integrations for this company
        const allActiveIntegrations = await db
          .select()
          .from(marketplaceIntegrations)
          .where(
            and(
              eq(marketplaceIntegrations.companyId, companyId),
              eq(marketplaceIntegrations.isActive, true)
            )
          )

        // Filter to only those selected in the daily sync settings
        const toSync = allActiveIntegrations.filter(integration =>
          company.fetchOrdersMarketplaces.includes(integration.id)
        )

        for (const integration of toSync) {
          await marketplaceSyncQueue.add(
            `sync-${integration.type}`,
            {
              companyId,
              marketplace: integration.type as any,
              triggeredByUserId: null,
              integrationId: integration.id,
            },
            {
              jobId: `sync-${integration.type}-${integration.id}-${companyId}-${Date.now()}`
            }
          )
        }

        return { success: true, message: `Dispatched daily sync for ${toSync.length} marketplaces.` }
      }

      const isInvoiceSync = job.name.includes('-invoices-') || (job.data as any).isInvoiceSync === true

      if (!isInvoiceSync) {
        await auditLog({
          companyId,
          userId: triggeredByUserId ?? null,
          action: 'sync_start',
          entityType: 'marketplace_sync',
          entityId: marketplace || 'unknown',
          nextState: { marketplace, startedAt: new Date().toISOString() },
        })
      }

      try {
        // Fetch credentials from the database
        let integration = null
        if (job.data.integrationId) {
          const [found] = await db
            .select()
            .from(marketplaceIntegrations)
            .where(
              and(
                eq(marketplaceIntegrations.companyId, companyId),
                eq(marketplaceIntegrations.id, job.data.integrationId),
                eq(marketplaceIntegrations.isActive, true)
              )
            )
            .limit(1)
          integration = found
        } else {
          // Try exact match first
          const [found] = await db
            .select()
            .from(marketplaceIntegrations)
            .where(
              and(
                eq(marketplaceIntegrations.companyId, companyId),
                eq(marketplaceIntegrations.type, marketplace as any),
                eq(marketplaceIntegrations.isActive, true)
              )
            )
            .limit(1)
          integration = found

          // If not found, try custom Mirakl integrations matching customName
          if (!integration && marketplace) {
            const customIntegrations = await db
              .select()
              .from(marketplaceIntegrations)
              .where(
                and(
                  eq(marketplaceIntegrations.companyId, companyId),
                  eq(marketplaceIntegrations.type, 'mirakl_custom'),
                  eq(marketplaceIntegrations.isActive, true)
                )
              )
            integration = customIntegrations.find(i => 
              ((i.metadata as any)?.customName || '').toLowerCase() === marketplace.toLowerCase()
            ) || null
          }
        }

        if (!integration) {
          throw new Error(`No active integration found for ${marketplace}`)
        }

        let rawOrders: NormalizedOrder[] = []
        const adapter = getAdapterForIntegration(integration)

        if (!adapter) {
          throw new Error(`Adapter for ${marketplace} could not be initialized (missing config or credentials).`)
        }

        if (!isInvoiceSync) {
          if (marketplace === 'otto') {
            rawOrders = await adapter.fetchUnshippedOrders(companyId, {
              fromDate: job.data.fromDate,
              toDate: job.data.toDate
            })
          } else if (
            marketplace === 'mirakl_decathlon' ||
            marketplace === 'mirakl_decathlon_eu' ||
            marketplace === 'mirakl_mediamarkt' ||
            marketplace === 'mirakl_custom'
          ) {
            rawOrders = await adapter.fetchUnshippedOrders(companyId, {
              fromDate: job.data.fromDate,
              toDate: job.data.toDate
            })
          } else if (marketplace === 'amazon') {
            rawOrders = await adapter.fetchUnshippedOrders(companyId)
          } else if (marketplace === 'shopify') {
            rawOrders = await adapter.fetchUnshippedOrders(companyId, {
              fromDate: job.data.fromDate,
              toDate: job.data.toDate
            })
          } else if (marketplace === 'aboutyou') {
            rawOrders = await adapter.fetchUnshippedOrders(companyId, {
              fromDate: job.data.fromDate,
              toDate: job.data.toDate
            })
          } else if (marketplace === 'kaufland') {
            rawOrders = await adapter.fetchUnshippedOrders(companyId, {
              fromDate: job.data.fromDate,
              toDate: job.data.toDate
            })
          } else if (marketplace === 'ebay') {
            rawOrders = await adapter.fetchUnshippedOrders(companyId, {
              fromDate: job.data.fromDate,
              toDate: job.data.toDate
            })
          } else if (marketplace === 'woocommerce') {
            rawOrders = await adapter.fetchUnshippedOrders(companyId, {
              fromDate: job.data.fromDate,
              toDate: job.data.toDate
            })
          } else if (marketplace === 'shopware') {
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
        }

        // Recovery: download invoices for shipped orders that are missing invoices
        await syncShippedOrdersInvoices(companyId, marketplace as any, integration.id)

        // Also sync returns for Mirakl integrations
        if (integration.type.startsWith('mirakl_') || integration.type === 'mirakl_custom') {
          await syncMiraklReturns(companyId, integration, adapter as MiraklAdapter)
        }

        if (!isInvoiceSync) {
          await auditLog({
            companyId,
            userId: triggeredByUserId,
            action: 'sync_complete',
            entityType: 'marketplace_sync',
            entityId: marketplace,
            nextState: { marketplace, completedAt: new Date().toISOString(), ordersImported: rawOrders.length },
          })
        }
      } catch (error) {
        if (!isInvoiceSync) {
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
        }
        throw error // Re-throw so BullMQ marks the job as failed and retries
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 5,
    }
  )
}

export function getAdapterForIntegration(
  integration: typeof marketplaceIntegrations.$inferSelect
): MarketplaceAdapter | null {
  if (integration.type === 'otto') {
    if (!integration.clientId || !integration.clientSecret) return null
    return new OttoAdapter({
      clientId: integration.clientId,
      clientSecret: integration.clientSecret,
      environment: (integration.environment as 'sandbox' | 'production') || 'production',
      installationId: (integration.metadata as any)?.installationId,
      appId: (integration.metadata as any)?.appId,
      connectionType: (integration.metadata as any)?.connectionType || 'service_partner'
    })
  }
  if (
    integration.type === 'mirakl_decathlon' ||
    integration.type === 'mirakl_decathlon_eu' ||
    integration.type === 'mirakl_mediamarkt' ||
    integration.type === 'mirakl_custom'
  ) {
    if (!integration.clientId) return null
    const customName = integration.type === 'mirakl_custom'
      ? ((integration.metadata as any)?.customName || 'mirakl_custom')
      : integration.type
    return new MiraklAdapter({
      instance: customName.toLowerCase(),
      baseUrl: integration.environment!,
      clientId: integration.clientId,
      clientSecret: integration.clientSecret || '',
      apiKey: integration.apiKey || undefined,
      shopId: (integration.metadata as any)?.shopId || undefined
    })
  }
  if (integration.type === 'amazon') {
    if (!integration.sellerId || !integration.clientId || !integration.clientSecret || !integration.refreshToken) return null
    return new AmazonAdapter({
      sellerId: integration.sellerId,
      clientId: integration.clientId,
      clientSecret: integration.clientSecret,
      refreshToken: integration.refreshToken
    })
  }
  if (integration.type === 'shopify') {
    if (!integration.environment || !integration.clientId || !integration.clientSecret) return null
    return new ShopifyAdapter()
  }
  if (integration.type === 'aboutyou') {
    if (!integration.apiKey) return null
    return new AboutYouAdapter({
      apiKey: integration.apiKey,
      environment: (integration.environment as 'sandbox' | 'production') || 'production'
    })
  }
  if (integration.type === 'kaufland') {
    if (!integration.clientId || !integration.clientSecret) return null
    return new KauflandAdapter({
      clientId: integration.clientId,
      clientSecret: integration.clientSecret,
      environment: (integration.environment as 'sandbox' | 'production') || 'production'
    })
  }
  if (integration.type === 'ebay') {
    if (!integration.clientId || !integration.clientSecret) return null
    return new EbayAdapter({
      clientId: integration.clientId,
      clientSecret: integration.clientSecret,
      environment: (integration.environment as 'sandbox' | 'production') || 'production'
    })
  }
  if (integration.type === 'woocommerce') {
    if (!integration.environment || !integration.clientId || !integration.clientSecret) return null
    return new WooCommerceAdapter({
      shopUrl: integration.environment,
      consumerKey: integration.clientId,
      consumerSecret: integration.clientSecret,
    })
  }
  if (integration.type === 'shopware') {
    if (!integration.environment || !integration.clientId || !integration.clientSecret) return null
    return new ShopwareAdapter({
      shopUrl: integration.environment,
      clientId: integration.clientId,
      clientSecret: integration.clientSecret,
    })
  }
  return null
}

export async function syncShippedOrdersInvoices(
  companyId: string,
  marketplace?: NormalizedOrder['marketplace'] | null,
  integrationId?: string | null
) {
  console.log(`[Worker] Starting syncShippedOrdersInvoices for company ${companyId}...`)
  try {
    let query: any = and(
      eq(marketplaceIntegrations.companyId, companyId),
      eq(marketplaceIntegrations.isActive, true)
    )

    if (integrationId) {
      query = and(query, eq(marketplaceIntegrations.id, integrationId))
    } else if (marketplace) {
      query = and(query, eq(marketplaceIntegrations.type, marketplace as any))
    }

    const activeIntegrations = await db.select().from(marketplaceIntegrations).where(query)

    for (const integration of activeIntegrations) {
      const downloadInvoice = !!(integration.metadata as any)?.downloadInvoice
      const autoInvoice = integration.autoInvoice
      if (!downloadInvoice && !autoInvoice) {
        continue
      }

      // Find shipped orders for this company & marketplace that don't have an invoice yet
      const autoInvoiceEnabledAt = (integration.metadata as any)?.autoInvoiceEnabledAt
      const thresholdDate = autoInvoiceEnabledAt
        ? new Date(autoInvoiceEnabledAt)
        : new Date('2026-05-01T00:00:00Z') // Default threshold to May 1st to prevent invoicing very old orders

      console.log(`[Worker Debug] Querying candidateOrders for company=${companyId}, marketplace=${integration.type}`)
      console.log(`[Worker Debug] thresholdDate=${thresholdDate.toISOString()}, autoInvoice=${autoInvoice}`)

      const candidateOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.companyId, companyId),
            integration.type === 'mirakl_custom'
              ? eq(orders.marketplace, ((integration.metadata as any)?.customName || 'mirakl_custom').toLowerCase())
              : eq(orders.marketplace, integration.type),
            eq(orders.status, 'shipped'),
            isNull(orders.invoiceId),
            eq(orders.isArchived, false),
            autoInvoice 
              ? gte(orders.createdAt, thresholdDate)
              : undefined
          )
        )

      if (candidateOrders.length === 0) {
        // Log to help debug why there are no candidates
        const rawShippedOrdersCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(orders)
          .where(
            and(
              eq(orders.companyId, companyId),
              integration.type === 'mirakl_custom'
                ? eq(orders.marketplace, ((integration.metadata as any)?.customName || 'mirakl_custom').toLowerCase())
                : eq(orders.marketplace, integration.type),
              eq(orders.status, 'shipped')
            )
          )
        
        console.log(`[Worker Debug] No candidateOrders found. Total shipped orders for marketplace: ${rawShippedOrdersCount[0]?.count}`)
        
        continue
      }

      console.log(`[Worker] Found ${candidateOrders.length} shipped orders without invoice for marketplace ${integration.type}`)

      const adapter = getAdapterForIntegration(integration)

      for (const order of candidateOrders) {
        try {
          if (downloadInvoice) {
            if (adapter) {
              await downloadAndSaveMarketplaceInvoice(order.id, companyId, adapter)
            } else {
              console.error(`[Worker] Failed to initialize adapter for ${integration.type} during syncShippedOrdersInvoices download`)
            }
          } else if (autoInvoice) {
            console.log(`[Worker] Recovery: Auto-generating invoice for order ${order.marketplaceOrderId}...`)
            const invResult = await createInvoiceForOrder(order.id, companyId)
            if (invResult && 'pdfBuffer' in invResult && integration.uploadInvoice && adapter?.uploadInvoice) {
              await adapter.uploadInvoice(
                order.marketplaceOrderId,
                invResult.pdfBuffer,
                `${invResult.invoiceNumber}.pdf`
              )
            }
          }
        } catch (err) {
          console.error(`[Worker] Failed to generate/download invoice for order ${order.marketplaceOrderId}:`, err)
        }
      }
    }
  } catch (err) {
    console.error(`[Worker] Error in syncShippedOrdersInvoices:`, err)
  }
}

// ─── Pre-cache Delivery Notes and Download Marketplace Invoices ───────────────
export async function generateOrDownloadDeliveryNote(
  orderId: string,
  companyId: string,
  adapter?: MarketplaceAdapter | null
) {
  const cacheKey = buildDeliveryNoteKey(companyId, orderId)
  try {
    const exists = await documentExists(cacheKey)
    if (exists) {
      console.log(`[Worker] Delivery note already exists for order ${orderId}, skipping.`)
      return
    }
  } catch (err) {
    console.warn(`[Worker] Failed to check if delivery note exists:`, err)
  }

  console.log(`[Worker] Generating or downloading delivery note for order ${orderId}...`)

  // Fetch order and items
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.companyId, companyId)),
    with: { items: true }
  })

  if (!order) {
    console.error(`[Worker] Order ${orderId} not found when generating delivery note.`)
    return
  }

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!company) {
    console.error(`[Worker] Company ${companyId} not found when generating delivery note.`)
    return
  }

  let pdfBuffer: Buffer
  if (order.marketplace === 'aboutyou' && adapter && 'getDeliveryNote' in adapter && typeof (adapter as any).getDeliveryNote === 'function') {
    try {
      pdfBuffer = await (adapter as any).getDeliveryNote(order.marketplaceOrderId, order.rawPayload)
    } catch (err) {
      console.error(`[Worker] Failed to download delivery note from About You for order ${order.marketplaceOrderId}:`, err)
      return
    }
  } else {
    try {
      const { renderToBuffer } = await import('@react-pdf/renderer')
      const { DeliveryNoteDocument } = await import('@/components/pdf/delivery-note')
      const React = await import('react')

      const orderWithItems = {
        ...order,
        items: order.items.map((i) => ({
          ...i,
          quantity: parseInt(i.quantity)
        }))
      }

      pdfBuffer = await renderToBuffer(
        React.createElement(DeliveryNoteDocument, {
          order: orderWithItems,
          company: company
        }) as any
      )
    } catch (err) {
      console.error(`[Worker] Failed to generate delivery note for order ${order.marketplaceOrderId}:`, err)
      return
    }
  }

  try {
    await uploadDocument(cacheKey, pdfBuffer)
    console.log(`[Worker] Successfully uploaded delivery note for order ${order.marketplaceOrderId}`)
  } catch (err) {
    console.error(`[Worker] Failed to upload delivery note PDF to storage for order ${order.marketplaceOrderId}:`, err)
  }
}

export async function downloadAndSaveMarketplaceInvoice(
  orderId: string,
  companyId: string,
  adapter?: MarketplaceAdapter | null
): Promise<boolean> {
  if (!adapter || !adapter.getInvoice) {
    console.log(`[Worker] Adapter does not support getInvoice for order ${orderId}`)
    return false
  }

  // Load order and items
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.companyId, companyId)),
    with: { items: true }
  })

  if (!order) {
    console.error(`[Worker] Order ${orderId} not found when downloading invoice.`)
    return false
  }

  if (order.invoiceId) {
    console.log(`[Worker] Order ${orderId} already has an invoice ${order.invoiceId}, skipping.`)
    return true
  }

  console.log(`[Worker] Downloading marketplace invoice for order ${order.marketplaceOrderId}...`)
  try {
    const result = await adapter.getInvoice(order.marketplaceOrderId, order.rawPayload)
    if (!result) {
      console.log(`[Worker] Adapter returned no invoice for order ${order.marketplaceOrderId}`)
      return false
    }

    let pdfBuffer: Buffer
    let invoiceNumber: string
    let wasAutoGenerated = false

    if (Buffer.isBuffer(result)) {
      pdfBuffer = result
      
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1)

      if (!company) {
        console.error(`[Worker] Company ${companyId} not found when generating invoice number.`)
        return false
      }

      const dbSettings = company.documentNumberSettings as any
      const config = dbSettings?.invoice || getDefaultSettings('invoice', company)

      if (config && config.auto) {
        wasAutoGenerated = true
        const nextNum = parseInt(config.next, 10) || 1
        const padding = config.padding || 5
        const customerNumber = order.customerNumber || ''
        
        invoiceNumber = formatDocumentNumber(
          config.format,
          nextNum,
          padding,
          customerNumber,
          ''
        )
      } else {
        // Fallback to legacy sequence generation
        const [lastInvoice] = await db
          .select({ invoiceNumber: invoices.invoiceNumber })
          .from(invoices)
          .where(and(eq(invoices.companyId, companyId), eq(invoices.documentType, 'invoice')))
          .orderBy(desc(invoices.invoiceNumber))
          .limit(1)

        let nextNumber = 1
        if (lastInvoice) {
          const match = lastInvoice.invoiceNumber.match(/(\d+)$/)
          if (match) nextNumber = parseInt(match[1]) + 1
        }
        invoiceNumber = `INV-${new Date().getFullYear()}-${nextNumber.toString().padStart(5, '0')}`
      }
    } else {
      pdfBuffer = result.pdfBuffer
      invoiceNumber = result.receiptNumber || `INV-${order.marketplaceOrderId}`
    }

    const storageKey = buildInvoiceKey(companyId, invoiceNumber)
    await uploadDocument(storageKey, pdfBuffer)

    await db.transaction(async (tx) => {
      // Re-verify inside transaction to avoid race conditions
      const currentOrder = await tx.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.companyId, companyId)),
        columns: { invoiceId: true }
      })
      if (currentOrder?.invoiceId) return

      if (wasAutoGenerated) {
        const [dbCompany] = await tx
          .select()
          .from(companies)
          .where(eq(companies.id, companyId))
          .for('update')

        if (dbCompany) {
          const currentSettings = dbCompany.documentNumberSettings as any || {}
          const config = currentSettings.invoice || getDefaultSettings('invoice', dbCompany)
          if (config && config.auto) {
            const nextNum = parseInt(config.next, 10) || 1
            const updatedSettings = {
              ...currentSettings,
              invoice: {
                ...config,
                next: (nextNum + 1).toString()
              }
            }
            
            const updateData: any = {
              documentNumberSettings: updatedSettings,
              nextInvoiceNumber: (nextNum + 1).toString(),
              updatedAt: new Date()
            }

            await tx.update(companies)
              .set(updateData)
              .where(eq(companies.id, companyId))
          }
        }
      }

      const calculatedSubtotal = order.items.reduce((sum: number, i: any) => sum + (parseFloat(i.unitPrice) * parseFloat(i.quantity)), 0)
      const calculatedTax = order.items.reduce((sum: number, i: any) => sum + (parseFloat(i.unitPrice) * parseFloat(i.quantity) * parseFloat(i.taxRate)), 0)
      const calculatedTotal = calculatedSubtotal + calculatedTax
      const averageTaxRate = calculatedSubtotal > 0 ? (calculatedTax / calculatedSubtotal) : 0.19

      const { isPaid } = extractPaymentInfo(order)

      const [newInvoice] = await tx
        .insert(invoices)
        .values({
          companyId,
          documentType: 'invoice',
          invoiceNumber,
          status: 'issued',
          recipientName: order.shippingName || order.buyerName || 'Kunde',
          recipientStreet: order.shippingStreet || '',
          recipientZip: order.shippingZip || '',
          recipientCity: order.shippingCity || '',
          recipientCountry: order.shippingCountry || 'DE',
          recipientEmail: order.buyerEmail || null,
          currency: order.currency || 'EUR',
          subtotalAmount: calculatedSubtotal.toFixed(2),
          taxAmount: calculatedTax.toFixed(2),
          totalAmount: calculatedTotal.toFixed(2),
          taxRate: averageTaxRate.toFixed(4),
          dueAt: order.marketplacePurchaseDate || new Date(),
          pdfStorageKey: storageKey,
          pdfGeneratedAt: new Date(),
          issuedAt: new Date(),
          paidAt: isPaid ? (order.marketplacePurchaseDate || new Date()) : null
        })
        .returning({ id: invoices.id })

      if (newInvoice && order.items.length > 0) {
        await tx.insert(invoiceItems).values(
          order.items.map((item: any, index: number) => ({
            invoiceId: newInvoice.id,
            companyId,
            position: (index + 1).toString(),
            sku: item.sku,
            description: item.title || 'Produkt',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            lineTotal: (parseFloat(item.unitPrice) * parseFloat(item.quantity)).toFixed(2),
          }))
        )
      }

      // Link order to invoice and update status to shipped since the invoice is now available
      const newStatus = order.status === 'pending' || order.status === 'invoiced' ? 'shipped' : order.status
      await tx.update(orders)
        .set({ 
          invoiceId: newInvoice.id,
          status: newStatus
        })
        .where(eq(orders.id, orderId))
    })

    console.log(`[Worker] Saved downloaded invoice ${invoiceNumber} for order ${order.marketplaceOrderId}`)
    return true
  } catch (err) {
    console.error(`[Worker] Error downloading and saving invoice for order ${order.marketplaceOrderId}:`, err)
    return false
  }
}

/**
 * Sync refunded returns from Mirakl and create credit notes.
 */
export async function syncMiraklReturns(
  companyId: string,
  integration: any,
  adapter: MiraklAdapter
) {
  const autoCreditNote = !!(integration.metadata as any)?.autoCreditNote
  if (!autoCreditNote) {
    console.log(`[MiraklReturnSync] Auto credit note is disabled for integration ${integration.id}.`)
    return
  }

  console.log(`[MiraklReturnSync] Fetching refunded returns for integration ${integration.id} (${integration.type})...`)

  try {
    const refundedReturns = await adapter.fetchRefundedReturns()
    if (!refundedReturns || refundedReturns.length === 0) {
      console.log(`[MiraklReturnSync] No returns found for integration ${integration.id}.`)
      return
    }

    const orderMarketplaceName = integration.type === 'mirakl_custom'
      ? ((integration.metadata as any)?.customName || 'mirakl_custom').toLowerCase()
      : integration.type

    // Fetch all local return logs to check for existing records
    const existingLogs = await db
      .select({ metadata: returnsLog.metadata })
      .from(returnsLog)
      .where(eq(returnsLog.companyId, companyId))

    const processedReturnIds = new Set<string>()
    for (const log of existingLogs) {
      if (log.metadata && typeof log.metadata === 'object') {
        const returnId = (log.metadata as any).return_id
        if (returnId) processedReturnIds.add(returnId)
      }
    }

    for (const ret of refundedReturns) {
      const returnId = ret.return_id
      if (!returnId) continue

      if (processedReturnIds.has(returnId)) {
        console.log(`[MiraklReturnSync] Return ${returnId} has already been processed, skipping.`)
        continue
      }

      console.log(`[MiraklReturnSync] Processing new return ${returnId} for order ${ret.order_id}...`)

      // Find the order
      const order = await db.query.orders.findFirst({
        where: and(
          eq(orders.companyId, companyId),
          eq(orders.marketplaceOrderId, ret.order_id),
          eq(orders.marketplace, orderMarketplaceName)
        ),
        with: { items: true }
      })

      if (!order) {
        console.warn(`[MiraklReturnSync] Matching order ${ret.order_id} not found in DB for company ${companyId}.`)
        continue
      }

      if (!order.invoiceId) {
        console.warn(`[MiraklReturnSync] Order ${ret.order_id} has no linked invoice yet. Cannot generate credit note.`)
        continue
      }

      // Fetch the original invoice
      const originalInvoice = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, order.invoiceId), eq(invoices.companyId, companyId))
      })

      if (!originalInvoice) {
        console.warn(`[MiraklReturnSync] Original invoice for order ${ret.order_id} not found in DB.`)
        continue
      }

      if (originalInvoice.status === 'cancelled') {
        console.warn(`[MiraklReturnSync] Original invoice ${originalInvoice.invoiceNumber} is already cancelled. Skipping.`)
        continue
      }

      // Get return items
      const returnItemsList = ret.return_items || ret.return_lines || []
      if (returnItemsList.length === 0) {
        console.warn(`[MiraklReturnSync] Return ${returnId} has no items. Skipping.`)
        continue
      }

      // Map returned items to order items and construct credit note line items
      const creditNoteItems: { sku: string; title: string; quantity: number; unitPrice: number; taxRate: number; description: string }[] = []
      let totalAmount = 0
      let subtotalAmount = 0
      let taxAmount = 0

      for (const retItem of returnItemsList) {
        const productSku = retItem.product_sku || retItem.sku
        if (!productSku) continue

        // Find match in order items
        const matchedItem = order.items.find(
          item => item.sku?.toLowerCase() === productSku.toLowerCase()
        )

        if (!matchedItem) {
          console.warn(`[MiraklReturnSync] Returned item ${productSku} not found in order ${order.marketplaceOrderId} items.`)
          continue
        }

        const qty = retItem.quantity || 1
        const netUnitPrice = parseFloat(matchedItem.unitPrice)
        const taxRate = parseFloat(matchedItem.taxRate)

        const lineNet = netUnitPrice * qty
        const lineTax = lineNet * taxRate
        const lineGross = lineNet + lineTax

        subtotalAmount += lineNet
        taxAmount += lineTax
        totalAmount += lineGross

        creditNoteItems.push({
          sku: matchedItem.sku || 'UNKNOWN',
          title: matchedItem.title,
          quantity: qty,
          unitPrice: netUnitPrice,
          taxRate: taxRate,
          description: matchedItem.title || 'Produkt'
        })
      }

      if (creditNoteItems.length === 0) {
        console.warn(`[MiraklReturnSync] No matching return items found in order. Skipping.`)
        continue
      }

      // Generate document number (creditNote sequence)
      const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
      if (!company) {
        console.error(`[MiraklReturnSync] Company not found.`)
        continue
      }

      const dbSettings = company.documentNumberSettings as any
      const config = dbSettings?.creditNote || getDefaultSettings('creditNote', company)

      let creditNoteNumber = ''
      if (config && config.auto) {
        const nextNum = parseInt(config.next, 10) || 1
        const padding = config.padding || 5
        creditNoteNumber = formatDocumentNumber(
          config.format,
          nextNum,
          padding,
          order.customerNumber || '',
          '',
          new Date()
        )
      } else {
        creditNoteNumber = `GS-${Date.now()}`
      }

      // Render PDF Buffer
      const { renderToBuffer } = await import('@react-pdf/renderer')
      const { InvoiceDocument } = await import('@/components/pdf/invoice')
      const React = await import('react')

      console.log(`[MiraklReturnSync] Rendering credit note PDF for ${creditNoteNumber}...`)

      const pdfBuffer = await renderToBuffer(
        React.createElement(InvoiceDocument, {
          invoiceNumber: creditNoteNumber,
          date: new Date(),
          dueDate: new Date(),
          orderNumber: order.marketplaceOrderId,
          orderDate: order.marketplacePurchaseDate || undefined,
          customerNumber: order.customerNumber || '–',
          company: {
            name: company.legalName || company.name,
            street: company.street || undefined,
            zip: company.zip || undefined,
            city: company.city || undefined,
            country: company.country,
            email: company.email || undefined,
            phone: company.phone || undefined,
            website: company.website || undefined,
            vatId: company.vatId || undefined,
            taxId: company.taxId || undefined,
            bankName: company.bankName || undefined,
            bankIban: company.iban || undefined,
            bankBic: company.bic || undefined,
            logoUrl: company.logoUrl || undefined,
            paymentRecipient: company.paymentRecipient || undefined,
            management: company.management || undefined,
            registrationCourt: company.registrationCourt || undefined,
            internationalLanguage: company.internationalLanguage || undefined,
            footerText: company.invoiceFooter || undefined,
            footerTextEn: company.invoiceFooterEn || undefined,
          },
          recipient: {
            name: originalInvoice.recipientName,
            street: originalInvoice.recipientStreet || '',
            zip: originalInvoice.recipientZip || '',
            city: originalInvoice.recipientCity || '',
            country: originalInvoice.recipientCountry || 'DE',
          },
          items: creditNoteItems.map(i => ({
            sku: i.sku,
            title: i.title,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            taxRate: i.taxRate,
          })),
          currency: order.currency,
          paymentMethod: 'Marketplace',
          isCreditNote: true,
          documentType: 'invoice',
          cancelsInvoiceNumber: originalInvoice.invoiceNumber,
          cancelsInvoiceDate: originalInvoice.createdAt || undefined,
        }) as any
      )

      // Upload PDF to S3/Storage
      const storageKey = buildInvoiceKey(companyId, creditNoteNumber)
      await uploadDocument(storageKey, pdfBuffer)

      // Save database records
      await db.transaction(async (tx) => {
        // Increment creditNote number sequence
        const [dbCompany] = await tx
          .select()
          .from(companies)
          .where(eq(companies.id, companyId))
          .for('update')

        if (dbCompany) {
          const currentSettings = dbCompany.documentNumberSettings as any || {}
          const config = currentSettings.creditNote || getDefaultSettings('creditNote', dbCompany)
          if (config && config.auto) {
            const nextNum = parseInt(config.next, 10) || 1
            const updatedSettings = {
              ...currentSettings,
              creditNote: {
                ...config,
                next: (nextNum + 1).toString()
              }
            }
            await tx.update(companies)
              .set({ documentNumberSettings: updatedSettings, updatedAt: new Date() })
              .where(eq(companies.id, companyId))
          }
        }

        // Insert Credit Note Invoice
        const [newCreditNoteInvoice] = await tx
          .insert(invoices)
          .values({
            companyId,
            invoiceNumber: creditNoteNumber,
            status: 'issued',
            documentType: 'invoice',
            recipientName: originalInvoice.recipientName,
            recipientStreet: originalInvoice.recipientStreet,
            recipientZip: originalInvoice.recipientZip,
            recipientCity: originalInvoice.recipientCity,
            recipientCountry: originalInvoice.recipientCountry,
            recipientEmail: originalInvoice.recipientEmail,
            currency: order.currency || 'EUR',
            subtotalAmount: subtotalAmount.toFixed(2),
            taxAmount: taxAmount.toFixed(2),
            totalAmount: totalAmount.toFixed(2),
            taxRate: (taxAmount / subtotalAmount || 0).toFixed(4),
            isCreditNote: true,
            cancelsInvoiceId: originalInvoice.id,
            dueAt: new Date(),
            pdfStorageKey: storageKey,
            pdfGeneratedAt: new Date(),
            issuedAt: new Date()
          })
          .returning({ id: invoices.id })

        // Insert Credit Note Items
        await tx.insert(invoiceItems).values(
          creditNoteItems.map((item, index) => ({
            invoiceId: newCreditNoteInvoice.id,
            companyId,
            position: (index + 1).toString(),
            sku: item.sku,
            description: item.description,
            quantity: item.quantity.toString(),
            unitPrice: item.unitPrice.toFixed(2),
            taxRate: item.taxRate.toString(),
            lineTotal: (item.unitPrice * item.quantity).toFixed(2),
          }))
        )

        // Insert return log record
        const [logEntry] = await tx.insert(returnsLog).values({
          companyId,
          orderId: order.id,
          orderNumber: order.marketplaceOrderId,
          customerName: order.buyerName,
          shippingAddress: `${order.shippingStreet || ''}, ${order.shippingZip || ''} ${order.shippingCity || ''}`,
          status: 'erfolgt',
          marketplace: order.marketplace,
          metadata: { return_id: returnId, mirakl_payload: ret, creditNoteId: newCreditNoteInvoice.id },
          notes: `Automatisch erstellte Gutschrift ${creditNoteNumber} für Mirakl Retoure.`
        }).returning({ id: returnsLog.id })

        // Insert returned items
        await tx.insert(returnedItems).values(
          creditNoteItems.map(item => ({
            returnLogId: logEntry.id,
            skuOrProductName: item.sku || item.description,
            quantity: item.quantity,
            condition: 'new',
            notes: 'Importiert von Mirakl Retoure'
          }))
        )

        // Insert Invoice Logs
        await tx.insert(invoiceLogs).values([
          {
            invoiceId: originalInvoice.id,
            companyId,
            action: 'edited',
            note: `Gutschrift ${creditNoteNumber} für diese Rechnung wurde automatisch erzeugt.`
          },
          {
            invoiceId: newCreditNoteInvoice.id,
            companyId,
            action: 'edited',
            note: `Gutschrift für Mirakl Retoure ${returnId} erzeugt.`
          }
        ])
      })

      console.log(`[MiraklReturnSync] Credit note ${creditNoteNumber} saved successfully.`)

      // Upload Credit Note back to Mirakl if auto-upload is active
      if (integration.uploadInvoice && adapter.uploadInvoice) {
        try {
          console.log(`[MiraklReturnSync] Uploading credit note ${creditNoteNumber} to Mirakl...`)
          await adapter.uploadInvoice(
            order.marketplaceOrderId,
            pdfBuffer,
            `${creditNoteNumber}.pdf`,
            true // isCreditNote = true
          )
        } catch (uploadErr) {
          console.error(`[MiraklReturnSync] Failed to upload credit note to Mirakl:`, uploadErr)
        }
      }
    }
  } catch (err) {
    console.error(`[MiraklReturnSync] Error syncing returns:`, err)
    throw err
  }
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
    let existingOrder = await db.query.orders.findFirst({
      where: and(
        eq(orders.companyId, companyId),
        eq(orders.marketplaceOrderId, order.marketplaceOrderId)
      )
    })

    // Pre-flight check for Otto positionItems to avoid duplicates from v3 -> v4 migration
    // or splitting anomalies where the same position item might be returned again.
    if (!existingOrder && order.marketplace === 'otto' && (order.rawPayload as any)?.positionItems?.length > 0) {
      const positionItems = (order.rawPayload as any).positionItems
      for (const item of positionItems) {
        if (!item.positionItemId) continue
        
        const duplicate = await db.query.orders.findFirst({
          where: and(
            eq(orders.companyId, companyId),
            eq(orders.marketplace, 'otto'),
            sql`${orders.rawPayload}->'positionItems' @> ${JSON.stringify([{ positionItemId: item.positionItemId }])}::jsonb`
          )
        })
        
        if (duplicate) {
          console.log(`[Worker] Skipping order ${order.marketplaceOrderId} because positionItemId ${item.positionItemId} is already imported in order ${duplicate.marketplaceOrderId}.`)
          existingOrder = duplicate
          break
        }
      }
    }

    if (existingOrder) {
      // Restore archived order if manual sync
      if (isManualSync && existingOrder.isArchived) {
        await db.update(orders)
          .set({ isArchived: false })
          .where(eq(orders.id, existingOrder.id))
        affected++
      }

      // Pre-cache/download delivery note for existing orders
      await generateOrDownloadDeliveryNote(existingOrder.id, companyId, adapter)

      // Note: Invoices are only created or downloaded on shipping confirmation.
      // So we do not generate any invoices here for existing orders.
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
      const shippingCountryCode = get2LetterCountryCode(order.shippingAddress.country)
      const countryVat = await tx.query.vatSettings.findFirst({
        where: and(
          eq(vatSettings.companyId, companyId),
          eq(vatSettings.countryCode, shippingCountryCode)
        )
      })

      // Resolve the VAT rate to apply
      let resolvedVatRate = 0.19 // Default to German VAT
      if (countryVat) {
        if (countryVat.vatType === 'below_threshold') {
          resolvedVatRate = 0.19 // below threshold uses German VAT (19%)
        } else if (countryVat.vatType === 'third_country') {
          resolvedVatRate = 0.00 // Third country uses 0%
        } else {
          resolvedVatRate = parseFloat(countryVat.vatRate)
        }
      }

      let finalTaxAmount = order.taxAmount
      if (countryVat) {
        finalTaxAmount = order.items.reduce((sum, item) => {
          const gross = item.unitPrice * item.quantity
          const net = gross / (1 + resolvedVatRate)
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
          buyerPhone: order.buyer.phone,
          shippingName: order.shippingAddress.name,
          shippingCompany: order.shippingAddress.company,
          shippingAddressAddition: order.shippingAddress.addressAddition,
          shippingPhone: order.shippingAddress.phone,
          shippingStreet: order.shippingAddress.street,
          shippingCity: order.shippingAddress.city,
          shippingZip: order.shippingAddress.zip,
          shippingCountry: shippingCountryCode,
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
            const rate = resolvedVatRate
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
        
        // Deduct stock for each item
        for (const item of order.items) {
          if (!item.sku || item.sku === 'N/A' || item.sku === 'UNKNOWN') continue;
          
          await tx.execute(sql`
            UPDATE ${products}
            SET current_stock = current_stock - ${item.quantity}
            WHERE company_id = ${companyId} AND sku = ${item.sku}
          `);
        }
      }
    })

    // ── Step 3: Generate or download invoice + delivery note AFTER the transaction is committed ────────
    // This avoids holding a DB lock during expensive PDF generation + S3 upload.
    if (newOrderId) {
      // 1. Always generate or download delivery note
      await generateOrDownloadDeliveryNote(newOrderId, companyId, adapter)
      
      // 2. Trigger pushUpdatesToMarketplaces for the updated stock
      const updates = order.items
        .filter(i => i.sku && i.sku !== 'N/A' && i.sku !== 'UNKNOWN')
        .map(i => ({ sku: i.sku as string }))

      if (updates.length > 0) {
        // Fetch current stock from db to pass to pushUpdatesToMarketplaces
        const skus = updates.map(u => u.sku)
        const updatedProducts = await db
          .select({ sku: products.sku, currentStock: products.currentStock })
          .from(products)
          .where(and(eq(products.companyId, companyId), inArray(products.sku, skus)))

        const stockUpdates = updatedProducts.map(p => ({
          sku: p.sku,
          stock: parseFloat(p.currentStock?.toString() || '0')
        }))

        if (stockUpdates.length > 0) {
          await pushUpdatesToMarketplaces(companyId, stockUpdates).catch(e => {
            console.error(`[Worker] Failed to push stock updates after order ${newOrderId}:`, e)
          })
        }
      }
    }
  }

  return { checked: normalizedOrders.length, affected }
}

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
import { eq, and, desc, isNull, inArray, gte } from 'drizzle-orm'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { invoices, invoiceItems } from '@/db/schema/invoices'
import { buildInvoiceKey, buildDeliveryNoteKey, documentExists, uploadDocument } from '@/lib/storage'
import { OttoAdapter } from '@/adapters/marketplace/otto'
import { MiraklAdapter } from '@/adapters/marketplace/mirakl'
import { AmazonAdapter } from '@/adapters/marketplace/amazon'
import { AboutYouAdapter } from '@/adapters/marketplace/aboutyou'
import { ShopifyAdapter } from '@/adapters/marketplace/shopify'
import { KauflandAdapter } from '@/adapters/marketplace/kaufland'
import { EbayAdapter } from '@/adapters/marketplace/ebay'
import type { NormalizedOrder, MarketplaceAdapter } from '@/adapters/marketplace/base'
import { createInvoiceForOrder, formatDocumentNumber, getDefaultSettings } from '@/lib/invoice-service'

// ─── Queue Name Constants ─────────────────────────────────────────────────────
export const QUEUE_MARKETPLACE_SYNC = 'marketplace-sync'

export type MarketplaceSyncJobData = {
  companyId: string
  marketplace?: NormalizedOrder['marketplace'] | null
  triggeredByUserId?: string | null
  fromDate?: string
  toDate?: string
  integrationId?: string | null
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
              jobId: `sync-${integration.type}-${companyId}-${Date.now()}`
            }
          )
        }

        return { success: true, message: `Dispatched daily sync for ${toSync.length} marketplaces.` }
      }

      await auditLog({
        companyId,
        userId: triggeredByUserId ?? null,
        action: 'sync_start',
        entityType: 'marketplace_sync',
        entityId: marketplace || 'unknown',
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
              job.data.integrationId 
                ? eq(marketplaceIntegrations.id, job.data.integrationId)
                : eq(marketplaceIntegrations.type, marketplace as any),
              eq(marketplaceIntegrations.isActive, true)
            )
          )
          .limit(1)

        if (!integration) {
          throw new Error(`No active integration found for ${marketplace}`)
        }

        const isInvoiceSync = job.name.includes('-invoices-')
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
      appId: (integration.metadata as any)?.appId
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
        : new Date('2026-05-26T12:00:00Z') // Default threshold to today to prevent invoicing older orders

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
        continue
      }

      console.log(`[Worker] Found ${candidateOrders.length} shipped orders without invoice for marketplace ${integration.type}`)

      const adapter = getAdapterForIntegration(integration)

      for (const order of candidateOrders) {
        try {
          if (downloadInvoice) {
            if (!adapter) {
              console.error(`[Worker] Failed to initialize adapter for ${integration.type} during syncShippedOrdersInvoices download`)
              continue
            }
            await downloadAndSaveMarketplaceInvoice(order.id, companyId, adapter)
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
      pdfBuffer = await (adapter as any).getDeliveryNote(order.marketplaceOrderId)
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
) {
  if (!adapter || !adapter.getInvoice) {
    console.log(`[Worker] Adapter does not support getInvoice for order ${orderId}`)
    return
  }

  // Load order and items
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.companyId, companyId)),
    with: { items: true }
  })

  if (!order) {
    console.error(`[Worker] Order ${orderId} not found when downloading invoice.`)
    return
  }

  if (order.invoiceId) {
    console.log(`[Worker] Order ${orderId} already has an invoice ${order.invoiceId}, skipping.`)
    return
  }

  console.log(`[Worker] Downloading marketplace invoice for order ${order.marketplaceOrderId}...`)
  try {
    const result = await adapter.getInvoice(order.marketplaceOrderId)
    if (!result) {
      console.log(`[Worker] Adapter returned no invoice for order ${order.marketplaceOrderId}`)
      return
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
        return
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
          issuedAt: new Date()
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
  } catch (err) {
    console.error(`[Worker] Error downloading and saving invoice for order ${order.marketplaceOrderId}:`, err)
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
      const countryVat = await tx.query.vatSettings.findFirst({
        where: and(
          eq(vatSettings.companyId, companyId),
          eq(vatSettings.countryCode, order.shippingAddress.country.toUpperCase())
        )
      })

      // Resolve the VAT rate to apply
      let resolvedVatRate = 0.19 // Default to German VAT
      if (countryVat) {
        if (countryVat.vatType === 'oss' || countryVat.vatType === 'below_threshold') {
          resolvedVatRate = 0.19 // OSS and below threshold use German VAT (19%)
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
      }
    })

    // ── Step 3: Generate or download invoice + delivery note AFTER the transaction is committed ────────
    // This avoids holding a DB lock during expensive PDF generation + S3 upload.
    if (newOrderId) {
      // 1. Always generate or download delivery note
      await generateOrDownloadDeliveryNote(newOrderId, companyId, adapter)
    }
  }

  return { checked: normalizedOrders.length, affected }
}

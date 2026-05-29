import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and, isNull, gte } from 'drizzle-orm'
import { createInvoiceForOrder } from '@/lib/invoice-service'
import { downloadAndSaveMarketplaceInvoice, getAdapterForIntegration } from '@/workers/marketplace-sync'

async function run() {
  console.log('🚀 Starting invoice recovery for today\'s pending orders...')
  
  // Set date threshold to the start of today (2026-05-26) in UTC
  const today = new Date('2026-05-26T00:00:00.000Z')
  
  const candidateOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.status, 'pending'),
        isNull(orders.invoiceId),
        gte(orders.createdAt, today)
      )
    )

  console.log(`Found ${candidateOrders.length} candidate pending orders created today.`)

  let processedCount = 0
  let successCount = 0

  for (const order of candidateOrders) {
    // Only target Decathlon and custom Mirakl integrations
    if (
      order.marketplace !== 'mirakl_decathlon' &&
      order.marketplace !== 'mirakl_decathlon_eu' &&
      order.marketplace !== 'mirakl_custom'
    ) {
      console.log(`Skipping order ${order.marketplaceOrderId} because marketplace is ${order.marketplace}`)
      continue
    }

    processedCount++
    console.log(`\n[${processedCount}] Processing order: ${order.marketplaceOrderId} (ID: ${order.id}, Marketplace: ${order.marketplace})`)
    
    // Find the active integration for this marketplace and company
    const [integration] = await db
      .select()
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, order.companyId),
          eq(marketplaceIntegrations.type, order.marketplace as any),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
      .limit(1)

    if (!integration) {
      console.log(`❌ No active integration found for company ${order.companyId} and marketplace ${order.marketplace}.`)
      continue
    }

    const downloadInvoice = !!(integration.metadata as any)?.downloadInvoice
    const autoInvoice = !!integration.autoInvoice

    if (!downloadInvoice && !autoInvoice) {
      console.log(`⚠️ Neither autoInvoice nor downloadInvoice is active for integration ${integration.id}.`)
      continue
    }

    const adapter = getAdapterForIntegration(integration)

    try {
      if (downloadInvoice) {
        if (adapter) {
          console.log(`📥 Downloading and saving marketplace invoice for order ${order.marketplaceOrderId}...`)
          await downloadAndSaveMarketplaceInvoice(order.id, order.companyId, adapter)
          successCount++
        } else {
          console.error(`❌ Failed to initialize adapter for ${integration.type}`)
        }
      } else if (autoInvoice) {
        console.log(`📝 Auto-generating invoice for order ${order.marketplaceOrderId}...`)
        const invResult = await createInvoiceForOrder(order.id, order.companyId)
        if (invResult && 'pdfBuffer' in invResult) {
          console.log(`✅ Invoice generated successfully: ${invResult.invoiceNumber}`)
          if (integration.uploadInvoice && adapter?.uploadInvoice) {
            console.log(`📤 Uploading auto-generated invoice for order ${order.marketplaceOrderId}...`)
            await adapter.uploadInvoice(
              order.marketplaceOrderId,
              invResult.pdfBuffer,
              `${invResult.invoiceNumber}.pdf`
            )
          }
          successCount++
        } else {
          console.error(`❌ Failed to generate invoice:`, invResult)
        }
      }
    } catch (err) {
      console.error(`❌ Error invoicing order ${order.marketplaceOrderId}:`, err)
    }
  }
  
  console.log(`\n🎉 Recovery run completed! Processed: ${processedCount}, Invoiced successfully: ${successCount}`)
  process.exit(0)
}

run().catch((err) => {
  console.error('Fatal error in recovery script:', err)
  process.exit(1)
})

import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { orders } from '../src/db/schema/orders'
import { invoices } from '../src/db/schema/invoices'
import { OttoAdapter } from '../src/adapters/marketplace/otto'
import { downloadAndSaveMarketplaceInvoice } from '../src/workers/marketplace-sync'
import { eq } from 'drizzle-orm'

async function run() {
  const orderId = 'efb30edf-24ed-42e8-b472-c7385a81ffd4'
  const companyId = '3c8718d2-8738-4239-9481-56b6b16b85fb'

  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(eq(marketplaceIntegrations.id, '6e9413ed-2bfc-4458-bdf8-9a41f85d466b'))
    .limit(1)

  if (!integration) {
    throw new Error('Integration not found')
  }

  const adapter = new OttoAdapter({
    clientId: integration.clientId!,
    clientSecret: integration.clientSecret!,
    environment: (integration.environment as 'sandbox' | 'production') || 'production',
    installationId: (integration.metadata as any)?.installationId,
    appId: (integration.metadata as any)?.appId
  })

  console.log('Running downloadAndSaveMarketplaceInvoice for shipped order...')
  try {
    await downloadAndSaveMarketplaceInvoice(orderId, companyId, adapter)
    console.log('Done running downloadAndSaveMarketplaceInvoice')
    
    // Check order again
    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId))
    console.log('Updated order invoiceId:', updatedOrder.invoiceId)

    if (updatedOrder.invoiceId) {
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, updatedOrder.invoiceId))
      console.log('Created invoice details:', invoice)
    }
  } catch (err) {
    console.error('Error during downloadAndSaveMarketplaceInvoice:', err)
  }

  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})

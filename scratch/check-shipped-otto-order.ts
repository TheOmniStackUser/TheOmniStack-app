import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import { OttoAdapter } from '../src/adapters/marketplace/otto'

async function run() {
  const salesOrderId = 'cbn4xr86sv'

  console.log(`Searching for order ${salesOrderId} in DB...`)
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.marketplaceOrderId, salesOrderId))
    .limit(1)

  if (!order) {
    console.error(`Order ${salesOrderId} not found in DB!`)
    process.exit(1)
  }

  console.log('Order found:', {
    id: order.id,
    companyId: order.companyId,
    marketplace: order.marketplace,
    marketplaceOrderId: order.marketplaceOrderId,
    status: order.status,
    trackingNumber: order.trackingNumber,
    invoiceId: order.invoiceId,
    labelUrl: order.labelUrl ? 'Yes' : 'No',
    createdAt: order.createdAt
  })

  // Find active integration for this company and type
  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, order.companyId),
        eq(marketplaceIntegrations.type, 'otto'),
        eq(marketplaceIntegrations.isActive, true)
      )
    )
    .limit(1)

  if (!integration) {
    console.error(`No active Otto integration found for company ${order.companyId}!`)
    process.exit(1)
  }

  console.log('Otto Integration found:', {
    id: integration.id,
    environment: integration.environment,
    downloadInvoice: (integration.metadata as any)?.downloadInvoice,
    autoInvoice: integration.autoInvoice,
    clientId: integration.clientId ? 'Set' : 'Not Set',
    clientSecret: integration.clientSecret ? 'Set' : 'Not Set'
  })

  const adapter = new OttoAdapter({
    clientId: integration.clientId!,
    clientSecret: integration.clientSecret!,
    environment: (integration.environment as 'sandbox' | 'production') || 'production',
    installationId: (integration.metadata as any)?.installationId,
    appId: (integration.metadata as any)?.appId
  })

  console.log('🔑 Fetching Access Token...')
  const token = await (adapter as any).getAccessToken()

  const listUrl = `${adapter.baseUrl}/v3/receipts?salesOrderId=${salesOrderId}`
  console.log(`Fetching Receipts for salesOrderId ${salesOrderId} from ${listUrl}...`)
  
  const response = await fetch(listUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  })

  console.log(`Status: ${response.status}`)
  try {
    const data = await response.json()
    console.log(`Receipts data:`, JSON.stringify(data, null, 2))
  } catch {
    console.log(`Response text:`, await response.text())
  }

  process.exit(0)
}

run().catch(console.error)

import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { orders } from '../src/db/schema/orders'
import { companies } from '../src/db/schema/companies'
import { eq, and, inArray } from 'drizzle-orm'
import { OttoAdapter } from '../src/adapters/marketplace/otto'
import { HermesAdapter } from '../src/adapters/shipping/hermes'
import { persistOrders } from '../src/workers/marketplace-sync'

async function run() {
  const companyId = 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'

  console.log('--- 1. Fetching Sandbox Otto Integration ---')
  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, companyId),
        eq(marketplaceIntegrations.type, 'otto'),
        eq(marketplaceIntegrations.environment, 'sandbox')
      )
    )
    .limit(1)

  if (!integration) {
    console.error('No sandbox Otto integration found')
    return
  }

  console.log('--- 2. Fetching Company Info ---')
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!company) {
    console.error('No company found')
    return
  }

  console.log('--- 3. Fetching Unshipped Orders from Otto Sandbox ---')
  const ottoAdapter = new OttoAdapter({
    clientId: integration.clientId!,
    clientSecret: integration.clientSecret!,
    environment: 'sandbox',
    appId: (integration.metadata as any)?.appId,
    installationId: (integration.metadata as any)?.installationId
  })

  const rawOrders = await ottoAdapter.fetchUnshippedOrders(companyId)
  console.log(`Fetched ${rawOrders.length} orders from Otto sandbox.`)

  if (rawOrders.length === 0) {
    console.log('No unshipped orders to process.')
    return
  }

  console.log('--- 4. Persisting Orders in DB ---')
  const syncResult = await persistOrders(companyId, rawOrders, true, integration, ottoAdapter)
  console.log(`Sync complete. Checked: ${syncResult.checked}, Affected (New): ${syncResult.affected}`)

  // Retrieve the stored orders that are pending
  const orderIds = rawOrders.map(o => o.marketplaceOrderId)
  const pendingOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.companyId, companyId),
        eq(orders.status, 'pending'),
        inArray(orders.marketplaceOrderId, orderIds)
      )
    )

  console.log(`Found ${pendingOrders.length} pending orders in DB ready to ship.`)

  console.log('--- 5. Initializing Hermes Sandbox Adapter ---')
  const username = 'testkunde3'
  const password = 'ewrfn:gN'
  
  const hermes = new HermesAdapter(null, null, username, password)
  // Override for Hermes Sandbox
  ;(hermes as any).appId = 'hsi.int.verm.theomnistack'
  ;(hermes as any).appSecret = 'ZRLD4LtrD8vDihgieheT'
  ;(hermes as any).authUrl = 'https://authme-int.myhermes.de/authorization-facade/oauth2/access_token'
  ;(hermes as any).baseUrl = 'https://de-api-int.hermesworld.com'
  hermes.setConfig({
    environment: 'sandbox',
    platformReturns: {
      otto: 'enclosed'
    }
  })

  console.log('--- 6. Generating Hermes Labels and Confirming Shipments ---')
  for (const order of pendingOrders) {
    console.log(`\nProcessing Order ID: ${order.id} (Marketplace Order ID: ${order.marketplaceOrderId})`)
    try {
      // Generate label
      const { labelUrl, returnLabelUrl, trackingNumber, returnTrackingNumber } = await hermes.generateLabelForOrder(order, company, 'S')
      console.log(`  -> Label Generated!`)
      console.log(`     Tracking: ${trackingNumber}`)
      console.log(`     Return Tracking: ${returnTrackingNumber}`)

      // Update order status in DB
      await db
        .update(orders)
        .set({
          status: 'shipped',
          trackingNumber,
          labelUrl,
          returnTrackingNumber,
          updatedAt: new Date()
        })
        .where(eq(orders.id, order.id))

      console.log(`  -> Updated order status to shipped in DB`)

      // Confirm shipment with Otto Sandbox
      console.log(`  -> Confirming shipment with Otto...`)
      await ottoAdapter.confirmShipment(
        order.marketplaceOrderId!,
        trackingNumber,
        'HERMES',
        returnTrackingNumber || undefined,
        order.rawPayload,
        (integration.metadata as any)?.returnAddressCarrierId
      )
      console.log(`  -> ✅ Shipment confirmed successfully on Otto!`)

    } catch (err: any) {
      console.error(`  -> ❌ Error processing order:`, err.message || err)
    }
  }

  console.log('\n--- Finished processing all orders! ---')
  process.exit(0)
}

run().catch(console.error)

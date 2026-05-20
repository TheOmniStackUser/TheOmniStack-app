import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { orders } from '../src/db/schema/orders'
import { companies } from '../src/db/schema/companies'
import { eq, and, inArray } from 'drizzle-orm'
import { OttoAdapter } from '../src/adapters/marketplace/otto'
import { HermesAdapter } from '../src/adapters/shipping/hermes'

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

  const ottoAdapter = new OttoAdapter({
    clientId: integration.clientId!,
    clientSecret: integration.clientSecret!,
    environment: 'sandbox',
    appId: (integration.metadata as any)?.appId,
    installationId: (integration.metadata as any)?.installationId
  })

  // Get the 6 sandbox orders
  const sandboxOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.companyId, companyId),
        eq(orders.marketplace, 'otto')
      )
    )

  console.log(`Found ${sandboxOrders.length} Otto sandbox orders in DB.`)

  console.log('--- 3. Initializing Hermes Sandbox Adapter ---')
  const username = 'testkunde3'
  const password = 'ewrfn:gN'
  
  const hermes = new HermesAdapter(null, null, username, password)
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

  console.log('--- 4. Processing Shipments ---')
  for (const order of sandboxOrders) {
    console.log(`\nProcessing Order ID: ${order.id} (Marketplace Order ID: ${order.marketplaceOrderId})`)
    
    try {
      let trackingNumber = order.trackingNumber
      let returnTrackingNumber = order.returnTrackingNumber
      let labelUrl = order.labelUrl

      // 1. Generate Hermes labels if not already generated
      if (!trackingNumber) {
        console.log(`  -> Generating Hermes labels...`)
        const result = await hermes.generateLabelForOrder(order, company, 'S')
        trackingNumber = result.trackingNumber
        returnTrackingNumber = result.returnTrackingNumber
        labelUrl = result.labelUrl

        // Update DB
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
        console.log(`  -> Labels generated and saved in DB: Outbound: ${trackingNumber}, Return: ${returnTrackingNumber}`)
      } else {
        console.log(`  -> Labels already exist in DB. Outbound: ${trackingNumber}, Return: ${returnTrackingNumber}`)
      }

      // 2. Confirm shipment on Otto Sandbox without the return tracking key (since return carrier is not configured)
      console.log(`  -> Confirming shipment with Otto (without return tracking key)...`)
      const token = await (ottoAdapter as any).getAccessToken()
      const rawOrderPayload = order.rawPayload as any
      const positionItems: any[] = []
      
      if (rawOrderPayload?.positionItems) {
        for (const item of rawOrderPayload.positionItems) {
          if (item.positionItemId) {
            positionItems.push({
              positionItemId: item.positionItemId,
              salesOrderId: order.marketplaceOrderId,
            })
          }
        }
      }

      const shipmentPayload = {
        trackingKey: {
          carrier: 'HERMES',
          trackingNumber: trackingNumber,
        },
        shipDate: new Date().toISOString().split('.')[0] + 'Z',
        shipFromAddress: {
          city: 'Hamburg',
          countryCode: 'DEU',
          zipCode: '20095'
        },
        positionItems,
      }

      const res = await fetch(`https://sandbox.api.otto.market/v1/shipments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(shipmentPayload)
      })

      if (res.status === 201) {
        console.log(`  -> ✅ Shipment confirmed successfully!`)
      } else {
        const body = await res.text()
        console.error(`  -> ❌ Failed to confirm shipment on Otto (Status ${res.status}): ${body}`)
      }

    } catch (err: any) {
      console.error(`  -> ❌ Error:`, err.message || err)
    }
  }

  console.log('\n--- Done! ---')
  process.exit(0)
}

run().catch(console.error)

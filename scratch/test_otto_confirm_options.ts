import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { orders } from '../src/db/schema/orders'
import { eq, and } from 'drizzle-orm'
import { OttoAdapter } from '../src/adapters/marketplace/otto'

async function run() {
  const companyId = 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'

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

  // Get one order to test
  const testOrder = await db.query.orders.findFirst({
    where: and(
      eq(orders.companyId, companyId),
      eq(orders.marketplace, 'otto'),
      eq(orders.marketplaceOrderId, '9a08a323-11bb-49c2-b890-d5ab42fe940a')
    )
  })

  if (!testOrder) {
    console.error('Test order not found')
    return
  }

  const adapter = new OttoAdapter({
    clientId: integration.clientId!,
    clientSecret: integration.clientSecret!,
    environment: 'sandbox',
    appId: (integration.metadata as any)?.appId,
    installationId: (integration.metadata as any)?.installationId
  })

  const token = await (adapter as any).getAccessToken()
  const rawOrderPayload = testOrder.rawPayload as any

  const positionItems: any[] = []
  if (rawOrderPayload?.positionItems) {
    for (const item of rawOrderPayload.positionItems) {
      if (item.positionItemId) {
        positionItems.push({
          positionItemId: item.positionItemId,
          salesOrderId: testOrder.marketplaceOrderId,
        })
      }
    }
  }

  console.log(`Order has ${positionItems.length} positionItems.`)

  // Option 1: Confirm shipment with carrier HERMES and NO return tracking key
  console.log('\n--- Option 1: Carrier HERMES, NO return tracking key ---')
  const payload1 = {
    trackingKey: {
      carrier: 'HERMES',
      trackingNumber: '05139131000247',
    },
    shipDate: new Date().toISOString().split('.')[0] + 'Z',
    shipFromAddress: {
      city: 'Hamburg',
      countryCode: 'DEU',
      zipCode: '20095'
    },
    positionItems: positionItems.map(item => ({
      ...item
    }))
  }

  let res = await fetch(`https://sandbox.api.otto.market/v1/shipments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload1)
  })

  console.log(`Status: ${res.status}`)
  console.log(`Body: ${await res.text()}`)

  // Option 2: Confirm shipment with carrier HERMES and return carrier DHL
  console.log('\n--- Option 2: Carrier HERMES, Return Carrier DHL ---')
  const payload2 = {
    trackingKey: {
      carrier: 'HERMES',
      trackingNumber: '05139131000247',
    },
    shipDate: new Date().toISOString().split('.')[0] + 'Z',
    shipFromAddress: {
      city: 'Hamburg',
      countryCode: 'DEU',
      zipCode: '20095'
    },
    positionItems: positionItems.map(item => ({
      ...item,
      returnTrackingKey: {
        carrier: 'DHL',
        trackingNumber: 'RET-DHL-123456789'
      }
    }))
  }

  res = await fetch(`https://sandbox.api.otto.market/v1/shipments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload2)
  })

  console.log(`Status: ${res.status}`)
  console.log(`Body: ${await res.text()}`)

  process.exit(0)
}

run().catch(console.error)

import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { orders } from '../src/db/schema/orders'
import { companies } from '../src/db/schema/companies'
import { eq, and } from 'drizzle-orm'
import { OttoAdapter } from '../src/adapters/marketplace/otto'
import { HermesAdapter } from '../src/adapters/shipping/hermes'

async function run() {
  const companyId = 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'
  const targetOrderId = '5108f040-b48b-4073-8dcd-76e938b5d591' // xjkd8nqkm3

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

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!company) {
    console.error('No company found')
    return
  }

  // Get the order from DB
  const order = await db.query.orders.findFirst({
    where: and(
      eq(orders.companyId, companyId),
      eq(orders.marketplaceOrderId, targetOrderId)
    )
  })

  if (!order) {
    console.error('Order xjkd8nqkm3 not found in DB')
    return
  }

  console.log('--- 2. Initializing Hermes Sandbox Adapter ---')
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

  console.log('--- 3. Generating a Fresh, Unique Hermes Sandbox Label ---')
  const result = await hermes.generateLabelForOrder(order, company, 'S')
  const trackingNumber = result.trackingNumber
  const returnTrackingNumber = result.returnTrackingNumber
  const labelUrl = result.labelUrl

  console.log(`Generated fresh outbound tracking: ${trackingNumber}`)
  console.log(`Generated fresh return tracking: ${returnTrackingNumber}`)

  // Update order in DB with new tracking details
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
  console.log('Updated order tracking in DB.')

  // Confirm shipment with Otto Sandbox
  console.log('--- 4. Confirming Shipment on Otto Sandbox ---')
  const ottoAdapter = new OttoAdapter({
    clientId: integration.clientId!,
    clientSecret: integration.clientSecret!,
    environment: 'sandbox',
    appId: (integration.metadata as any)?.appId,
    installationId: (integration.metadata as any)?.installationId
  })

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

  const shipRes = await fetch(`https://sandbox.api.otto.market/v1/shipments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(shipmentPayload)
  })

  console.log(`Shipment Confirmation Status: ${shipRes.status}`)
  const shipBody = await shipRes.text()
  console.log(`Shipment Confirmation Body: ${shipBody}`)

  if (shipRes.status !== 201) {
    console.error('Failed to confirm shipment. Cannot proceed with returns.')
    return
  }

  console.log('--- 5. Waiting a few seconds for Otto status update ---')
  await new Promise(resolve => setTimeout(resolve, 5000))

  // Exchanging developer token for installation access token with returns scope
  console.log('--- 6. Processing Return Acceptance (Refund) for all items ---')
  const devRes = await fetch('https://sandbox.api.otto.market/sec-api/auth/realms/deepsea-sandbox/protocol/openid-connect/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${integration.clientId}:${integration.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'developer'
    })
  })
  const devData = await devRes.json()
  const devToken = devData.access_token

  const instRes = await fetch(`https://sandbox.api.otto.market/v1/apps/${integration.metadata.appId}/installations/${integration.metadata.installationId}/accessToken`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${devToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'orders receipts shipments returns'
    })
  })
  const instData = await instRes.json()
  const returnToken = instData.access_token

  const order1Items = [
    'f8fed781-9bd4-4cb6-815a-ced65b08b65f',
    '755e0a74-d43c-4451-8373-59dddfb975b4',
    'c39fc7cf-ed72-46ee-a880-4d167e57341c',
    '57ffc6e7-cb41-482e-9352-f22c3b679193',
    'eb1adf6c-2106-4691-80cc-4b385946cace'
  ]

  const returnPayload = {
    positionItems: order1Items.map(itemId => ({
      positionItemId: itemId,
      salesOrderId: targetOrderId,
      details: {
        reason: 'RETURN_RECEIVED',
        condition: 'A'
      }
    }))
  }

  const returnRes = await fetch('https://sandbox.api.otto.market/v3/returns/acceptance', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${returnToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(returnPayload)
  })

  console.log(`Return Acceptance Status: ${returnRes.status}`)
  const returnBody = await returnRes.text()
  console.log(`Return Acceptance Body: ${returnBody}`)

  if (returnRes.status === 200 || returnRes.status === 201 || returnRes.status === 204) {
    console.log('✅ Successfully processed return for all items of xjkd8nqkm3!')
    // Update DB status to cancelled
    await db
      .update(orders)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(orders.id, order.id))
    console.log('DB order status updated to cancelled.')
  } else {
    console.error('❌ Failed to process return for xjkd8nqkm3.')
  }

  process.exit(0)
}

run().catch(console.error)

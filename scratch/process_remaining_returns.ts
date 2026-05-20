import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { orders } from '../src/db/schema/orders'
import { eq, and } from 'drizzle-orm'

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

  const clientId = integration.clientId!
  const clientSecret = integration.clientSecret!
  const appId = (integration.metadata as any)?.appId
  const installationId = (integration.metadata as any)?.installationId

  // Get tokens
  console.log('🔑 Fetching tokens...')
  const devRes = await fetch('https://sandbox.api.otto.market/sec-api/auth/realms/deepsea-sandbox/protocol/openid-connect/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'developer'
    })
  })
  const devData = await devRes.json()
  const devToken = devData.access_token

  const instRes = await fetch(`https://sandbox.api.otto.market/v1/apps/${appId}/installations/${installationId}/accessToken`, {
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
  const token = instData.access_token

  console.log('Processing Return Acceptance (Refund) for all items in order xjkd8nqkm3...')
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
      'Authorization': `Bearer ${token}`,
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
      .where(eq(orders.marketplaceOrderId, targetOrderId))
    console.log('DB order status updated to cancelled.')
  } else {
    console.error('❌ Failed to process return for xjkd8nqkm3.')
  }

  process.exit(0)
}

run().catch(console.error)

import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { orders } from '../src/db/schema/orders'
import { eq, and } from 'drizzle-orm'
import { OttoAdapter } from '../src/adapters/marketplace/otto'

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

  const clientId = integration.clientId!
  const clientSecret = integration.clientSecret!
  const appId = (integration.metadata as any)?.appId
  const installationId = (integration.metadata as any)?.installationId

  console.log('🔑 Exchanging developer token for installation access token with RETURNS scope...')
  // 1. Get developer token
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const devRes = await fetch('https://sandbox.api.otto.market/sec-api/auth/realms/deepsea-sandbox/protocol/openid-connect/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'developer'
    })
  })
  const devData = await devRes.json()
  const devToken = devData.access_token

  // 2. Exchange developer token for installation access token with returns scope
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

  if (!token) {
    console.error('Failed to exchange installation token:', instData)
    return
  }

  console.log('Token successfully fetched with returns scope!')

  // 1. Order xjkd8nqkm3 (Marketplace ID: 5108f040-b48b-4073-8dcd-76e938b5d591)
  // Refund everything (5 items)
  console.log('\n--- 2. Processing Return for Order xjkd8nqkm3 (Refund All) ---')
  const order1Id = '5108f040-b48b-4073-8dcd-76e938b5d591'
  const order1Items = [
    'f8fed781-9bd4-4cb6-815a-ced65b08b65f',
    '755e0a74-d43c-4451-8373-59dddfb975b4',
    'c39fc7cf-ed72-46ee-a880-4d167e57341c',
    '57ffc6e7-cb41-482e-9352-f22c3b679193',
    'eb1adf6c-2106-4691-80cc-4b385946cace'
  ]

  const payload1 = {
    positionItems: order1Items.map(itemId => ({
      positionItemId: itemId,
      salesOrderId: order1Id,
      details: {
        reason: 'RETURN_RECEIVED',
        condition: 'A'
      }
    }))
  }

  console.log('Sending payload to /v3/returns/acceptance:', JSON.stringify(payload1, null, 2))
  const res1 = await fetch('https://sandbox.api.otto.market/v3/returns/acceptance', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload1)
  })

  console.log(`Status: ${res1.status}`)
  const body1 = await res1.text()
  console.log(`Body: ${body1}`)

  if (res1.status === 201 || res1.status === 200 || res1.status === 204) {
    console.log('✅ Successfully processed return for xjkd8nqkm3 on Otto!')
    // Update DB status to cancelled
    await db
      .update(orders)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(orders.marketplaceOrderId, order1Id))
    console.log('DB order status updated to cancelled.')
  } else {
    console.error('❌ Failed to process return for xjkd8nqkm3 on Otto.')
  }

  // 2. Order xjkdht5x65 (Marketplace ID: 85a8f161-4579-436b-a389-aa467e4b859e)
  // Refund FancyFlower-m-pi (Item ID: 4c8403c2-dadc-445d-9e92-22cabb88e50b)
  console.log('\n--- 3. Processing Return for Order xjkdht5x65 (Refund FancyFlower-m-pi) ---')
  const order2Id = '85a8f161-4579-436b-a389-aa467e4b859e'
  const order2ItemId = '4c8403c2-dadc-445d-9e92-22cabb88e50b'

  const payload2 = {
    positionItems: [
      {
        positionItemId: order2ItemId,
        salesOrderId: order2Id,
        details: {
          reason: 'RETURN_RECEIVED',
          condition: 'A'
        }
      }
    ]
  }

  console.log('Sending payload to /v3/returns/acceptance:', JSON.stringify(payload2, null, 2))
  const res2 = await fetch('https://sandbox.api.otto.market/v3/returns/acceptance', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload2)
  })

  console.log(`Status: ${res2.status}`)
  const body2 = await res2.text()
  console.log(`Body: ${body2}`)

  if (res2.status === 201 || res2.status === 200 || res2.status === 204) {
    console.log('✅ Successfully processed return for FancyFlower-m-pi on Otto!')
  } else {
    console.error('❌ Failed to process return for FancyFlower-m-pi on Otto.')
  }

  process.exit(0)
}

run().catch(console.error)

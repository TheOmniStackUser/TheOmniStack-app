import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
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

  const adapter = new OttoAdapter({
    clientId: integration.clientId!,
    clientSecret: integration.clientSecret!,
    environment: 'sandbox',
    appId: (integration.metadata as any)?.appId,
    installationId: (integration.metadata as any)?.installationId
  })

  const token = await (adapter as any).getAccessToken()

  const endpoints = [
    '/v1/returnaddresses',
    '/v1/returncarriers',
    '/v1/shippingproviders',
    '/v1/carriers'
  ]

  for (const ep of endpoints) {
    console.log(`\n--- Fetching GET ${ep} ---`)
    const response = await fetch(`https://sandbox.api.otto.market${ep}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    })

    console.log(`Status: ${response.status}`)
    try {
      console.log(`Body: ${JSON.stringify(await response.json(), null, 2)}`)
    } catch {
      console.log(`Body (text): ${await response.text()}`)
    }
  }

  process.exit(0)
}

run().catch(console.error)

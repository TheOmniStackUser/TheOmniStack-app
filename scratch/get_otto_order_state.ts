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

  const orderIds = [
    '5108f040-b48b-4073-8dcd-76e938b5d591',
    '85a8f161-4579-436b-a389-aa467e4b859e'
  ]

  for (const id of orderIds) {
    console.log(`\n--- Fetching order ${id} from Otto ---`)
    const res = await fetch(`https://sandbox.api.otto.market/v4/orders/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    })

    console.log(`Status: ${res.status}`)
    try {
      const data = await res.json()
      console.log(JSON.stringify(data, null, 2))
    } catch {
      console.log(await res.text())
    }
  }

  process.exit(0)
}

run().catch(console.error)

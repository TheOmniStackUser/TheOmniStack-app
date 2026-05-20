import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
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

  const adapter = new OttoAdapter({
    clientId: integration.clientId!,
    clientSecret: integration.clientSecret!,
    environment: 'sandbox',
    appId: (integration.metadata as any)?.appId,
    installationId: (integration.metadata as any)?.installationId
  })

  console.log('🔑 Fetching Access Token...')
  const token = await (adapter as any).getAccessToken()

  console.log('--- 2. Fetching Receipts from Otto Sandbox (No params) ---')
  const response = await fetch('https://sandbox.api.otto.market/v3/receipts', {
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

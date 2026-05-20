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

  console.log('🔑 Fetching Access Token...')
  const token = await (adapter as any).getAccessToken()

  const variations = [
    '?limit=1',
    '?limit=1&receiptTypes=PURCHASE',
    '?limit=1&receiptTypes=REFUND',
    '?limit=5&from=2026-05-18T00:00:00Z',
    '?limit=5&from=2026-05-19T00:00:00Z'
  ]

  for (const query of variations) {
    console.log(`\n--- Querying /v3/receipts${query} ---`)
    try {
      const response = await fetch(`https://sandbox.api.otto.market/v3/receipts${query}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      })

      console.log(`Status: ${response.status}`)
      const text = await response.text()
      try {
        const json = JSON.parse(text)
        console.log(`Body:`, JSON.stringify(json, null, 2))
      } catch {
        console.log(`Body (text):`, text)
      }
    } catch (err: any) {
      console.error('Fetch error:', err.message)
    }
  }

  process.exit(0)
}

run().catch(console.error)

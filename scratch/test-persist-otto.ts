import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { OttoAdapter } from '../src/adapters/marketplace/otto'
import { persistOrders } from '../src/workers/marketplace-sync'
import { eq } from 'drizzle-orm'

async function main() {
  const integrations = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'otto'))
  const integration = integrations.find(i => i.companyId === '3c8718d2-8738-4239-9481-56b6b16b85fb')
  if (!integration) return;

  const adapter = new OttoAdapter({
    clientId: integration.clientId!,
    clientSecret: integration.clientSecret!,
    environment: integration.environment as any,
    installationId: (integration.metadata as any)?.installationId,
    appId: (integration.metadata as any)?.appId
  })
  
  const unshipped = await adapter.fetchUnshippedOrders(integration.companyId)
  if (unshipped.length > 0) {
    console.log(`Importing all ${unshipped.length} unshipped orders...`)
    try {
      const res = await persistOrders(integration.companyId, unshipped, false, integration, adapter)
      console.log('Persist result:', res)
    } catch (err) {
      console.error('Persist error:', err)
    }
  }
  process.exit(0)
}
main().catch(console.error)

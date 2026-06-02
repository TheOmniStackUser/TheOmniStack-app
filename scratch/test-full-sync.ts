import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq } from 'drizzle-orm'
import { OttoAdapter } from '../src/adapters/marketplace/otto'
import { persistOrders } from '../src/workers/marketplace-sync'

async function runSync() {
  const integrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(eq(marketplaceIntegrations.type, 'otto'))

  for (const integration of integrations) {
    if (!integration.isActive) continue
    console.log(`\n========================================`)
    console.log(`Running Sync for Company: ${integration.companyId}`)

    const adapter = new OttoAdapter({
      clientId: integration.clientId!,
      clientSecret: integration.clientSecret!,
      environment: (integration.environment as 'sandbox' | 'production') || 'production',
      installationId: (integration.metadata as any)?.installationId,
      appId: (integration.metadata as any)?.appId
    })

    try {
      console.log("Fetching unshipped orders...")
      const rawOrders = await adapter.fetchUnshippedOrders(integration.companyId)
      console.log(`Found ${rawOrders.length} orders. Persisting...`)
      
      if (rawOrders.length > 0) {
        const result = await persistOrders(integration.companyId, rawOrders, true, integration, adapter)
        console.log(`Sync complete. Checked: ${result.checked}, Affected: ${result.affected}`)
      } else {
        console.log("No orders to persist.")
      }
    } catch (err) {
      console.error("Error during sync execution:", err)
    }
  }

  process.exit(0)
}

runSync().catch(err => {
  console.error(err)
  process.exit(1)
})

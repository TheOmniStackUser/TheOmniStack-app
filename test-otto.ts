import { db } from './src/db/client'
import { marketplaceIntegrations } from './src/db/schema/integrations'
import { eq } from 'drizzle-orm'
import { OttoAdapter } from './src/adapters/marketplace/otto'

async function run() {
  const integrations = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'otto'))
  console.log("Found Otto integrations:", integrations.length)
  if (integrations.length > 0) {
    const int = integrations[0]
    const cid = int.companyId
    console.log("Using companyId:", cid)
    
    const adapter = new OttoAdapter({
      clientId: int.clientId!,
      clientSecret: int.clientSecret!,
      environment: int.environment as any,
      installationId: (int.metadata as any)?.installationId,
      appId: (int.metadata as any)?.appId,
      connectionType: (int.metadata as any)?.connectionType || 'service_partner'
    })
    
    try {
      const orders = await adapter.fetchUnshippedOrders(cid)
      console.log("Orders:", orders.length)
    } catch(e) {
      console.error("CRASH:", e)
    }
  }
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

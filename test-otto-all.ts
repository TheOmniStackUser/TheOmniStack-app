import { db } from './src/db/client'
import { marketplaceIntegrations } from './src/db/schema/integrations'
import { eq } from 'drizzle-orm'
import { OttoAdapter } from './src/adapters/marketplace/otto'

async function run() {
  const integrations = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'otto'))
  console.log("Found Otto integrations:", integrations.length)
  
  for (let i = 0; i < integrations.length; i++) {
    const int = integrations[i]
    if (!int.isActive) {
      console.log(`Integration ${i} is inactive, skipping.`)
      continue;
    }
    const cid = int.companyId
    console.log(`Testing integration ${i} (companyId: ${cid})...`)
    
    const adapter = new OttoAdapter({
      clientId: int.clientId!,
      clientSecret: int.clientSecret!,
      environment: int.environment as any,
      installationId: (int.metadata as any)?.installationId,
      appId: (int.metadata as any)?.appId,
      connectionType: (int.metadata as any)?.connectionType || 'service_partner'
    })
    
    try {
      const startTime = Date.now()
      const orders = await adapter.fetchUnshippedOrders(cid)
      console.log(`Integration ${i} Orders: ${orders.length}, Time: ${Date.now() - startTime}ms`)
    } catch(e) {
      console.error(`Integration ${i} CRASH:`, e)
    }
  }
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

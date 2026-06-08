import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { orders } from '../src/db/schema/orders'
import { OttoAdapter } from '../src/adapters/marketplace/otto'
import { eq, and, sql } from 'drizzle-orm'

async function main() {
  const integrations = await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.type, 'otto'))
  for (const integration of integrations) {
    if (!integration.clientId || !integration.clientSecret) continue;
    const adapter = new OttoAdapter({
      clientId: integration.clientId,
      clientSecret: integration.clientSecret,
      environment: integration.environment as any,
      installationId: (integration.metadata as any)?.installationId,
      appId: (integration.metadata as any)?.appId
    })
    
    const unshipped = await adapter.fetchUnshippedOrders(integration.companyId)
    
    for (const order of unshipped) {
      let existingOrder = await db.query.orders.findFirst({
        where: and(
          eq(orders.companyId, integration.companyId),
          eq(orders.marketplaceOrderId, order.marketplaceOrderId)
        )
      })

      if (!existingOrder && order.marketplace === 'otto' && (order.rawPayload as any)?.positionItems?.length > 0) {
        const positionItems = (order.rawPayload as any).positionItems
        for (const item of positionItems) {
          if (!item.positionItemId) continue
          
          const duplicate = await db.query.orders.findFirst({
            where: and(
              eq(orders.companyId, integration.companyId),
              eq(orders.marketplace, 'otto'),
              sql`${orders.rawPayload}->'positionItems' @> ${JSON.stringify([{ positionItemId: item.positionItemId }])}::jsonb`
            )
          })
          
          if (duplicate) {
            console.log(`[Worker] Skipping order ${order.marketplaceOrderId} because positionItemId ${item.positionItemId} is already imported in order ${duplicate.marketplaceOrderId}.`)
            existingOrder = duplicate
            break
          }
        }
      }
      
      if (!existingOrder) {
        console.log(`Order ${order.marketplaceOrderId} is truly missing and not skipped due to duplicate positionItemId!`)
      }
    }
  }
  process.exit(0)
}
main().catch(console.error)

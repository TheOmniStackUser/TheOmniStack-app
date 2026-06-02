import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq } from 'drizzle-orm'
import { OttoAdapter } from '../src/adapters/marketplace/otto'

async function testOtto() {
  // Find active Otto integrations
  const integrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(eq(marketplaceIntegrations.type, 'otto'))

  if (integrations.length === 0) {
    console.log("No Otto integrations found in the database.")
    process.exit(0)
  }

  for (const integration of integrations) {
    console.log(`\n========================================`)
    console.log(`Testing Otto integration ID: ${integration.id} (isActive: ${integration.isActive})`)
    if (!integration.isActive) {
      console.log("Skipping inactive integration.")
      continue
    }

    const adapter = new OttoAdapter({
      clientId: integration.clientId!,
      clientSecret: integration.clientSecret!,
      environment: (integration.environment as 'sandbox' | 'production') || 'production',
      installationId: (integration.metadata as any)?.installationId,
      appId: (integration.metadata as any)?.appId
    })

    try {
      console.log("Fetching orders using OttoAdapter...")
      const orders = await adapter.fetchUnshippedOrders(integration.companyId)
      console.log(`Successfully fetched ${orders.length} normalized orders!`)
      if (orders.length > 0) {
        console.log("First order example:", JSON.stringify({
          marketplaceOrderId: orders[0].marketplaceOrderId,
          purchaseDate: orders[0].purchaseDate,
          buyerName: orders[0].buyer.name,
          totalAmount: orders[0].totalAmount,
          itemCount: orders[0].items.length
        }, null, 2))
      }
    } catch (err) {
      console.error("Error fetching orders:", err)
    }
  }

  process.exit(0)
}

testOtto().catch(err => {
  console.error("Unhandle test error:", err)
  process.exit(1)
})

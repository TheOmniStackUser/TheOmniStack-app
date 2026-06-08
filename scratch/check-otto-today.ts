import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { orders } from '../src/db/schema/orders'
import { OttoAdapter } from '../src/adapters/marketplace/otto'
import { eq } from 'drizzle-orm'

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
    
    // Fetch unshipped (PROCESSABLE)
    const unshipped = await adapter.fetchUnshippedOrders(integration.companyId)
    console.log(`Company ${integration.companyId}: ${unshipped.length} PROCESSABLE orders.`)
    
    // Check if these are in the DB
    let missing = 0;
    for (const o of unshipped) {
      const dbOrder = await db.query.orders.findFirst({
        where: (orders, { and, eq }) => and(
          eq(orders.marketplaceOrderId, o.marketplaceOrderId),
          eq(orders.companyId, integration.companyId)
        )
      })
      if (!dbOrder) {
        missing++;
        console.log(`Missing order in DB: ${o.marketplaceOrderId} from ${o.purchaseDate}`)
      }
    }
    console.log(`Company ${integration.companyId}: ${missing} orders missing from DB out of the ${unshipped.length} PROCESSABLE.`)

    // Fetch ALL orders from yesterday and today to see total count
    const accessToken = await (adapter as any).getAccessToken()
    const baseUrl = (adapter as any).baseUrl
    
    // Let's get orders for the last 2 days without fulfillment status filter
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 2);
    const dateStr = fromDate.toISOString().split('T')[0]
    
    let nextUrl: string | null = `${baseUrl}/v4/orders?limit=50&fromOrderDate=${dateStr}T00:00:00Z`
    let allOrders: any[] = []
    
    while (nextUrl) {
      const res = await fetch(nextUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
      })
      if (!res.ok) break;
      const data = await res.json()
      const chunk = data.resources || []
      allOrders.push(...chunk)
      
      const nextLink = (data.links || []).find((l: any) => l.rel === 'next')
      const rawNextUrl = nextLink?.href
      if (rawNextUrl) {
        nextUrl = rawNextUrl.startsWith('http') ? rawNextUrl : `${baseUrl}${rawNextUrl.startsWith('/') ? '' : '/'}${rawNextUrl}`
      } else {
        nextUrl = null
      }
    }
    console.log(`Company ${integration.companyId}: Fetched ${allOrders.length} total orders from Otto since ${dateStr}`)
    
    // Count by fulfillmentStatus
    const statusCounts: Record<string, number> = {}
    for (const ro of allOrders) {
      const s = ro.fulfillmentStatus || 'UNKNOWN'
      statusCounts[s] = (statusCounts[s] || 0) + 1
    }
    console.log('Status counts:', statusCounts)

  }
  process.exit(0)
}
main().catch(console.error)

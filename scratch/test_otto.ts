import { OttoAdapter } from '../src/adapters/marketplace/otto'
import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

async function testOtto() {
  console.log('Fetching Otto integration credentials...')
  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'),
        eq(marketplaceIntegrations.type, 'otto')
      )
    )
    .limit(1)

  if (!integration) {
    console.error('No Otto integration found')
    process.exit(1)
  }

  console.log('Initializing Otto Adapter...')
  const adapter = new OttoAdapter(
    integration.clientId!,
    integration.clientSecret!,
    integration.environment as 'production' | 'sandbox'
  )

  try {
    console.log('Fetching unshipped orders...')
    const orders = await adapter.fetchUnshippedOrders()
    console.log(`Successfully fetched ${orders.length} unshipped orders.`)
  } catch (error: any) {
    console.error('ERROR during Otto import:')
    console.error(error)
    if (error.response) {
      console.error('Response details:', error.response.data)
    }
  }
  process.exit(0)
}

testOtto().catch(console.error)

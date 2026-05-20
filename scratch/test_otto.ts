import { OttoAdapter } from '../src/adapters/marketplace/otto'
import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq } from 'drizzle-orm'

async function testOtto() {
  console.log('Fetching all Otto integration credentials...')
  const integrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(eq(marketplaceIntegrations.type, 'otto'))

  console.log(`Found ${integrations.length} Otto integration(s).`)

  for (const integration of integrations) {
    console.log(`\nTesting integration for company: ${integration.companyId} (${integration.environment})`)
    console.log(`Client ID: ${integration.clientId}`)
    
    const adapter = new OttoAdapter({
      clientId: integration.clientId!,
      clientSecret: integration.clientSecret!,
      environment: integration.environment as 'production' | 'sandbox',
      installationId: (integration.metadata as any)?.installationId,
      appId: (integration.metadata as any)?.appId
    })

    try {
      console.log('Attempting to fetch unshipped orders (this will fetch token first)...')
      const orders = await adapter.fetchUnshippedOrders(integration.companyId)
      console.log(`SUCCESS! Successfully fetched ${orders.length} unshipped orders.`)
    } catch (error: any) {
      console.error('ERROR during Otto test connection:')
      console.error(error.message || error)
    }
  }
  process.exit(0)
}

testOtto().catch(console.error)

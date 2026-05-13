import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

async function checkDhlCreds() {
  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(
      and(
        eq(marketplaceIntegrations.companyId, 'abe0132f-18e4-41a8-92f7-e65005cfa6aa'),
        eq(marketplaceIntegrations.type, 'dhl')
      )
    )
    .limit(1)

  if (!integration) {
    console.error('No DHL integration found')
    process.exit(1)
  }

  const config = integration.metadata as any
  console.log('DHL API Key Length:', config.apiKey?.length)
  console.log('DHL Username Length:', config.username?.length)
  
  if (config.apiKey !== config.apiKey?.trim()) {
    console.log('WARNING: API Key has leading/trailing whitespaces!')
  }

  process.exit(0)
}

checkDhlCreds().catch(console.error)

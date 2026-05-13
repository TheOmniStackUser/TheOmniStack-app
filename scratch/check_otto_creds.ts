import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

async function checkOttoCreds() {
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

  console.log('Environment:', integration.environment)
  console.log('Client ID length:', integration.clientId?.length)
  console.log('Client ID (first 4 chars):', integration.clientId?.substring(0, 4))
  console.log('Client Secret length:', integration.clientSecret?.length)
  
  if (integration.clientId?.trim() !== integration.clientId) {
    console.log('WARNING: Client ID has leading/trailing whitespaces!')
  }
  if (integration.clientSecret?.trim() !== integration.clientSecret) {
    console.log('WARNING: Client Secret has leading/trailing whitespaces!')
  }
  
  // Update credentials just in case?
  process.exit(0)
}

checkOttoCreds().catch(console.error)

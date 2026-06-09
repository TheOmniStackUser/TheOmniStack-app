import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())
import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq, and } from 'drizzle-orm'

async function main() {
  const [integration] = await db
    .select()
    .from(marketplaceIntegrations)
    .where(and(eq(marketplaceIntegrations.type, 'otto'), eq(marketplaceIntegrations.isActive, true)))
    .limit(1)

  if (!integration) {
    console.log('No active Otto integration found')
    process.exit(1)
  }

  console.log('Current metadata:', JSON.stringify(integration.metadata, null, 2))

  const existingMetadata = (integration.metadata as any) || {}
  const updatedMetadata = {
    ...existingMetadata,
    connectionType: 'private',
  }

  await db
    .update(marketplaceIntegrations)
    .set({ metadata: updatedMetadata })
    .where(eq(marketplaceIntegrations.id, integration.id))

  console.log('\n✅ Updated metadata:', JSON.stringify(updatedMetadata, null, 2))
  console.log('\nDone! Now re-run the product import.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })

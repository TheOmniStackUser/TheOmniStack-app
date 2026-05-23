import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { eq } from 'drizzle-orm'

async function main() {
  try {
    const integrations = await db
      .select()
      .from(marketplaceIntegrations)
      .where(eq(marketplaceIntegrations.type, 'aboutyou'))
    
    console.log("About You Integrations:")
    integrations.forEach(i => {
      console.log({
        id: i.id,
        companyId: i.companyId,
        isActive: i.isActive,
        environment: i.environment,
        apiKey: i.apiKey ? `${i.apiKey.substring(0, 10)}...` : null,
        metadata: i.metadata
      })
    })
    process.exit(0);
  } catch (err) {
    console.error(err)
    process.exit(1);
  }
}

main()

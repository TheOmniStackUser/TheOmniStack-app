import { db } from './src/db/client'
import { marketplaceIntegrations } from './src/db/schema/integrations'

async function check() {
  const all = await db.select().from(marketplaceIntegrations)
  console.log(JSON.stringify(all, null, 2))
  process.exit(0)
}

check()

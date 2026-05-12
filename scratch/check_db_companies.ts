import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'

async function debug() {
  const all = await db.select().from(marketplaceIntegrations)
  console.log('--- Integrations with Company IDs ---')
  all.forEach(i => {
    console.log(`Typ: ${i.type}, CompanyID: ${i.companyId}`)
  })
}

debug().catch(console.error)

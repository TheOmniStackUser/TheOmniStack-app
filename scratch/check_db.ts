import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'

async function debug() {
  const all = await db.select().from(marketplaceIntegrations)
  console.log('--- Alle Integrationen (Detail) ---')
  all.forEach(i => {
    console.log(JSON.stringify({
      id: i.id,
      type: i.type,
      clientId: i.clientId,
      clientSecret: i.clientSecret ? 'PRESENT' : 'MISSING',
      apiKey: i.apiKey ? 'PRESENT' : 'MISSING',
      environment: i.environment
    }, null, 2))
  })
}

debug().catch(console.error)

import { db } from './src/db/client'
import { marketplaceIntegrations } from './src/db/schema/integrations'
import { syncProductsForCompany } from './src/workers/product-sync'

async function check() {
  const all = await db.select().from(marketplaceIntegrations)
  console.log('Integrations:', all.map(i => ({ id: i.id, type: i.type, active: i.isActive, hasSecret: !!(i.metadata as any)?.clientSecret })))
  
  const limango = all.find(i => i.type === 'mirakl_custom' && (i.metadata as any)?.customName === 'Limango')
  if (limango) {
    console.log('Running sync for Limango...')
    await syncProductsForCompany(limango.companyId, limango.id)
  } else {
    console.log('No Limango integration found.')
  }

  process.exit(0)
}
check()

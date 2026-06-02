import { db } from '../src/db/client'
import { marketplaceIntegrations } from '../src/db/schema/integrations'
import { companies } from '../src/db/schema/companies'
import { eq } from 'drizzle-orm'

async function inspect() {
  const integrations = await db
    .select({
      id: marketplaceIntegrations.id,
      companyId: marketplaceIntegrations.companyId,
      companyName: companies.name,
      type: marketplaceIntegrations.type,
      isActive: marketplaceIntegrations.isActive,
      autoInvoice: marketplaceIntegrations.autoInvoice,
      uploadInvoice: marketplaceIntegrations.uploadInvoice,
      metadata: marketplaceIntegrations.metadata,
    })
    .from(marketplaceIntegrations)
    .leftJoin(companies, eq(marketplaceIntegrations.companyId, companies.id))
    .where(eq(marketplaceIntegrations.type, 'otto'))

  console.log("Otto Integrations in DB:")
  console.log(JSON.stringify(integrations, null, 2))
  process.exit(0)
}

inspect().catch(err => {
  console.error(err)
  process.exit(1)
})

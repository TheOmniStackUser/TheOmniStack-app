import { db } from '../src/db/client'
import { invoices } from '../src/db/schema/invoices'
import { eq } from 'drizzle-orm'

async function run() {
  console.log('Querying invoices...')
  const result = await db.select({
    id: invoices.id,
    companyId: invoices.companyId,
    invoiceNumber: invoices.invoiceNumber,
    documentType: invoices.documentType,
    status: invoices.status,
    draftName: invoices.draftName
  }).from(invoices)
  
  console.log('Found invoices count:', result.length)
  console.log('Invoices list:')
  console.log(JSON.stringify(result, null, 2))
}

run().catch(console.error)

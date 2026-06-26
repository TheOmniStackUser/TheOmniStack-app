import { db } from './src/db/client'
import { invoices } from './src/db/schema/invoices'
import { invoiceLogs } from './src/db/schema/invoices'
import { sql, eq, desc, and } from 'drizzle-orm'
import { config } from 'dotenv'

config({ path: '.env.local' })

async function run() {
  const quoteLogs = await db.select()
    .from(invoiceLogs)
    .innerJoin(invoices, eq(invoices.id, invoiceLogs.invoiceId))
    .where(and(eq(invoices.documentType, 'quote'), eq(invoiceLogs.action, 'email')))
    .limit(5)
  console.log('Quote Logs:', JSON.stringify(quoteLogs, null, 2))
  process.exit(0)
}
run()

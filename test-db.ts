import { db } from './src/db/client'
import { invoices } from './src/db/schema/invoices'
import { invoiceLogs } from './src/db/schema/invoices'
import { sql, eq, desc } from 'drizzle-orm'
import { config } from 'dotenv'

config({ path: '.env.local' })

async function run() {
  const allQuotes = await db
    .select({
      id: invoices.id,
      emailSentAt: sql<Date | null>`(SELECT created_at FROM invoice_logs WHERE invoice_id = ${invoices.id} AND action = 'email' ORDER BY created_at DESC LIMIT 1)`.as('emailSentAt')
    })
    .from(invoices)
    .where(eq(invoices.documentType, 'quote'))
    .orderBy(desc(invoices.createdAt))
    .limit(5)

  console.log('Quotes:', allQuotes)

  const logs = await db.select().from(invoiceLogs).limit(5)
  console.log('Logs:', logs)
  
  process.exit(0)
}
run()

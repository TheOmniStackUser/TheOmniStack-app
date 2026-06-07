import { db } from '../src/db/client'
import { invoices, invoiceItems } from '../src/db/schema'
import { like, eq } from 'drizzle-orm'

async function check() {
  const miraklInvoices = await db.query.invoices.findMany({
    where: like(invoices.recipientEmail, '%@mirakl.net'),
    with: {
      items: true
    }
  })
  
  let needsFix = 0
  for (const inv of miraklInvoices) {
    const hasShipping = inv.items.some(i => i.sku === 'SHIPPING')
    if (!hasShipping) {
      needsFix++
      console.log(`Invoice ${inv.invoiceNumber} (ID: ${inv.id}) lacks shipping.`)
    }
  }
  
  console.log(`Total mirakl invoices: ${miraklInvoices.length}, Needs fix: ${needsFix}`)
  process.exit(0)
}
check().catch(console.error)

import { db } from '../src/db/client'
import { invoices, invoiceLogs } from '../src/db/schema/invoices'
import { orders } from '../src/db/schema/orders'
import { and, eq, isNull } from 'drizzle-orm'

async function fixOttoInvoices() {
  const unpaid = await db
    .select({
      invoiceId: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      createdAt: invoices.createdAt,
      purchaseDate: orders.marketplacePurchaseDate,
      companyId: invoices.companyId,
    })
    .from(invoices)
    .leftJoin(orders, eq(invoices.id, orders.invoiceId))
    .where(and(
      eq(orders.marketplace, 'otto'),
      isNull(invoices.paidAt)
    ))

  console.log(`Found ${unpaid.length} unpaid Otto invoices to mark as paid.`)

  let updatedCount = 0
  for (const item of unpaid) {
    const paymentDate = item.purchaseDate || item.createdAt || new Date()
    
    await db.transaction(async (tx) => {
      // 1. Update invoice to be paid
      await tx
        .update(invoices)
        .set({ paidAt: paymentDate })
        .where(eq(invoices.id, item.invoiceId))

      // 2. Add log entry
      await tx.insert(invoiceLogs).values({
        invoiceId: item.invoiceId,
        companyId: item.companyId,
        action: 'payment',
        note: `Automatisch als bezahlt markiert (Otto.de Marktplatz-Zahlung).`
      })
    })

    console.log(`  Updated invoice ${item.invoiceNumber} (paidAt: ${paymentDate.toISOString()})`)
    updatedCount++
  }

  console.log(`Successfully updated ${updatedCount} Otto invoices to paid status.`)
  process.exit(0)
}

fixOttoInvoices().catch(err => {
  console.error(err)
  process.exit(1)
})

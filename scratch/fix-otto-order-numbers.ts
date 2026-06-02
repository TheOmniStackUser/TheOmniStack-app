import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { invoices } from '../src/db/schema/invoices'
import { eq, and, sql, not } from 'drizzle-orm'

async function run() {
  console.log('Starting Otto Order Numbers Fix...')

  // 1. Find all Otto orders where rawPayload->>'orderNumber' is NOT null
  // and marketplaceOrderId is NOT equal to rawPayload->>'orderNumber'
  const allOttoOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.marketplace, 'otto'),
      sql`raw_payload->>'orderNumber' IS NOT NULL`
    )
  })

  let updatedOrders = 0
  let updatedInvoices = 0

  for (const order of allOttoOrders) {
    const rawPayload = order.rawPayload as any
    const realOrderNumber = rawPayload?.orderNumber

    if (!realOrderNumber) continue

    if (order.marketplaceOrderId !== realOrderNumber) {
      console.log(`Fixing Order ${order.id}: ${order.marketplaceOrderId} -> ${realOrderNumber}`)
      
      // Update the order's marketplaceOrderId
      await db.update(orders)
        .set({ marketplaceOrderId: realOrderNumber })
        .where(eq(orders.id, order.id))
      
      updatedOrders++

      // If it has an invoice, update the invoiceNumber if it currently matches the old UUID
      if (order.invoiceId) {
        const invoice = await db.query.invoices.findFirst({
          where: eq(invoices.id, order.invoiceId)
        })

        if (invoice) {
          // Otto invoices were saved with UUID either from result.receiptNumber or 'INV-' + UUID
          // Often receiptNumber is the UUID `172d17f1-e5c1-4a40-a531-e907afc31d6d`
          // So if invoiceNumber is length >= 32 (like a UUID) or starts with 'INV-', let's fix it.
          // For Otto, it makes sense to just set the invoiceNumber to the real order number!
          if (invoice.invoiceNumber && invoice.invoiceNumber.length >= 20) {
            console.log(`  Fixing Invoice ${invoice.id}: ${invoice.invoiceNumber} -> ${realOrderNumber}`)
            await db.update(invoices)
              .set({ invoiceNumber: realOrderNumber })
              .where(eq(invoices.id, invoice.id))
            
            updatedInvoices++
          }
        }
      }
    }
  }

  console.log(`Finished. Updated ${updatedOrders} orders and ${updatedInvoices} invoices.`)
  process.exit(0)
}

run().catch(console.error)

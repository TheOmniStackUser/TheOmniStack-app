import { db } from '../src/db/client'
import { orders } from '../src/db/schema/orders'
import { invoices } from '../src/db/schema/invoices'
import { and, eq } from 'drizzle-orm'
import { createInvoiceForOrder, extractPaymentInfo } from '../src/lib/invoice-service'

async function simulate() {
  const orderId = "8d83cbf3-fcfa-464c-95c2-cf6454aa0839"

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)

  if (!order) {
    console.log(`Order ${orderId} not found.`)
    process.exit(1)
  }

  console.log("Candidate order:", order.id, "marketplaceOrderId:", order.marketplaceOrderId)
  console.log("extractPaymentInfo output:", extractPaymentInfo(order))

  try {
    await db.transaction(async (tx) => {
      // Temporarily clear invoiceId to allow creation
      await tx.update(orders).set({ invoiceId: null }).where(eq(orders.id, order.id))

      console.log("Creating invoice in transaction...")
      const res = await createInvoiceForOrder(order.id, order.companyId, {
        txContext: tx
      })

      if (res && 'invoiceId' in res) {
        const [tempInvoice] = await tx
          .select()
          .from(invoices)
          .where(eq(invoices.id, res.invoiceId))
          .limit(1)

        console.log("Generated Invoice Fields inside transaction:")
        console.log(JSON.stringify(tempInvoice, null, 2))
      } else {
        console.log("Invoice creation skipped or failed:", res)
      }

      console.log("Rolling back transaction...")
      tx.rollback()
    })
  } catch (err: any) {
    if (err.message === 'Rollback' || !err.message) {
      console.log("Transaction successfully rolled back.")
    } else {
      console.error("Error in simulation:", err)
    }
  }

  process.exit(0)
}

simulate().catch(err => {
  console.error(err)
  process.exit(1)
})

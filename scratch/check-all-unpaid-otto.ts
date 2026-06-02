import { db } from '../src/db/client'
import { invoices } from '../src/db/schema/invoices'
import { orders } from '../src/db/schema/orders'
import { and, eq, isNull } from 'drizzle-orm'
import { extractPaymentInfo } from '../src/lib/invoice-service'

async function checkAll() {
  const unpaid = await db
    .select({
      invoiceId: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      orderId: orders.id,
      marketplace: orders.marketplace,
      rawPayload: orders.rawPayload,
    })
    .from(invoices)
    .leftJoin(orders, eq(invoices.id, orders.invoiceId))
    .where(and(
      eq(orders.marketplace, 'otto'),
      isNull(invoices.paidAt)
    ))

  console.log(`Found ${unpaid.length} unpaid Otto invoices. Running extractPaymentInfo on each...`)

  let countPaidTrue = 0
  let countPaidFalse = 0
  const falseList: any[] = []

  for (const item of unpaid) {
    const paymentInfo = extractPaymentInfo(item)
    if (paymentInfo.isPaid) {
      countPaidTrue++
    } else {
      countPaidFalse++
      falseList.push({
        invoiceNumber: item.invoiceNumber,
        marketplace: item.marketplace,
        paymentInfo
      })
    }
  }

  console.log(`Results:`)
  console.log(`  isPaid = true: ${countPaidTrue}`)
  console.log(`  isPaid = false: ${countPaidFalse}`)
  if (falseList.length > 0) {
    console.log(`Sample of isPaid = false:`, JSON.stringify(falseList.slice(0, 5), null, 2))
  }

  process.exit(0)
}

checkAll().catch(err => {
  console.error(err)
  process.exit(1)
})

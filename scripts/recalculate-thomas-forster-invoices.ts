import { db } from '../src/db/client'
import { sql, eq } from 'drizzle-orm'
import { invoices, invoiceItems } from '../src/db/schema/invoices'
import { orders, orderItems } from '../src/db/schema/orders'
import { regenerateInvoicePdf } from '../src/lib/invoice-service'

const COMPANY_ID = '306e66d0-cd16-4ec0-98ac-a11bd34659d7'

function is7PercentItem(sku: string | null | undefined): boolean {
  if (!sku) return false
  const s = sku.toUpperCase()
  return (
    (s.includes('GC-GG') || s.includes('GC-BG')) &&
    !s.includes('TEESIEB')
  )
}

async function main() {
  console.log(`Starting recalculation for company ${COMPANY_ID}...`)

  // 1. Find all candidate invoices
  const candidateInvoices = await db.execute(sql`
    SELECT DISTINCT i.id, i.invoice_number, i.total_amount, i.created_at
    FROM invoices i
    JOIN orders o ON o.invoice_id = i.id
    JOIN order_items oi ON oi.order_id = o.id
    WHERE i.company_id = ${COMPANY_ID}
      AND (
        oi.sku LIKE '%GC-GG%' OR
        oi.sku LIKE '%GC-BG%'
      )
      AND oi.tax_rate != '0.0700'
    ORDER BY i.created_at DESC
  `)

  console.log(`Found ${candidateInvoices.length} invoices to recalculate.`)

  let count = 0
  for (const row of candidateInvoices) {
    const invoiceId = row.id as string
    const invoiceNumber = row.invoice_number as string

    // Fetch order
    const order = await db.query.orders.findFirst({
      where: eq(orders.invoiceId, invoiceId),
      with: { items: true }
    })

    if (!order) {
      console.warn(`[Skip] No order found for invoice ${invoiceNumber} (${invoiceId})`)
      continue
    }

    // Fetch invoice items
    const invItems = await db.query.invoiceItems.findMany({
      where: eq(invoiceItems.invoiceId, invoiceId)
    })

    // Calculate new item amounts
    let orderNetTotal = 0
    let orderTaxTotal = 0

    // Update order items
    for (const oi of order.items) {
      const oldNet = parseFloat(oi.unitPrice)
      const oldRate = parseFloat(oi.taxRate)
      const qty = parseFloat(oi.quantity)
      const grossUnit = oldNet * (1 + oldRate)

      const targetRate = is7PercentItem(oi.sku) ? 0.07 : oldRate
      const newNetUnit = grossUnit / (1 + targetRate)
      const newNetLine = newNetUnit * qty
      const newTaxLine = (grossUnit * qty) - newNetLine

      orderNetTotal += newNetLine
      orderTaxTotal += newTaxLine

      await db.update(orderItems)
        .set({
          taxRate: targetRate.toFixed(4),
          unitPrice: newNetUnit.toFixed(4)
        })
        .where(eq(orderItems.id, oi.id))
    }

    // Update invoice items
    for (const ii of invItems) {
      const oldNet = parseFloat(ii.unitPrice)
      const oldRate = parseFloat(ii.taxRate)
      const qty = parseFloat(ii.quantity)
      const grossUnit = oldNet * (1 + oldRate)

      const targetRate = is7PercentItem(ii.sku) ? 0.07 : oldRate
      const newNetUnit = grossUnit / (1 + targetRate)
      const newNetLine = newNetUnit * qty

      await db.update(invoiceItems)
        .set({
          taxRate: targetRate.toFixed(4),
          unitPrice: newNetUnit.toFixed(2),
          lineTotal: newNetLine.toFixed(2)
        })
        .where(eq(invoiceItems.id, ii.id))
    }

    const orderGrossTotal = orderNetTotal + orderTaxTotal
    const averageTaxRate = orderNetTotal > 0 ? (orderTaxTotal / orderNetTotal) : 0

    // Update invoice record
    await db.update(invoices)
      .set({
        subtotalAmount: orderNetTotal.toFixed(2),
        taxAmount: orderTaxTotal.toFixed(2),
        totalAmount: orderGrossTotal.toFixed(2),
        taxRate: averageTaxRate.toFixed(4)
      })
      .where(eq(invoices.id, invoiceId))

    // Update order record
    await db.update(orders)
      .set({
        subtotalAmount: orderNetTotal.toFixed(2),
        taxAmount: orderTaxTotal.toFixed(2),
        totalAmount: orderGrossTotal.toFixed(2)
      })
      .where(eq(orders.id, order.id))

    // Regenerate PDF
    try {
      await regenerateInvoicePdf(invoiceId, COMPANY_ID)
      count++
      if (count % 10 === 0 || count === candidateInvoices.length) {
        console.log(`[Progress] Recalculated & regenerated ${count} / ${candidateInvoices.length} (latest: ${invoiceNumber})`)
      }
    } catch (err) {
      console.error(`Error regenerating PDF for invoice ${invoiceNumber}:`, err)
    }
  }

  console.log(`Successfully recalculated ${count} invoices with 7% VAT.`)
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error during recalculation:', err)
  process.exit(1)
})

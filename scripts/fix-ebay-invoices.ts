import { db } from '../src/db/client'
import { eq, inArray } from 'drizzle-orm'
import { orders, orderItems } from '../src/db/schema/orders'
import { invoices, invoiceItems } from '../src/db/schema/invoices'
import { regenerateInvoicePdf } from '../src/lib/invoice-service'

const COMPANY_ID = '8b079980-2c1a-4cfb-82bd-30f95c5cb339'

async function main() {
  console.log(`Checking eBay orders for company ${COMPANY_ID}...`)

  const ebayOrders = await db.select().from(orders).where(eq(orders.marketplace, 'ebay'))
  console.log(`Found ${ebayOrders.length} eBay orders.`)

  for (const o of ebayOrders) {
    if (o.companyId !== COMPANY_ID) continue

    const raw = o.rawPayload as any
    if (!raw) continue

    const rawTotal = parseFloat(raw.pricingSummary?.total?.value || '0')
    const rawDeliveryCost = parseFloat(raw.pricingSummary?.deliveryCost?.value || '0')
    const lineItems = raw.lineItems || []

    const currentItems = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id))
    let invoice = null
    if (o.invoiceId) {
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, o.invoiceId))
      invoice = inv
    }

    // Determine expected items from rawPayload
    const expectedLineItems = lineItems.map((li: any) => {
      const lineCost = parseFloat(li.discountedLineItemCost?.value || li.lineItemCost?.value || '0')
      const qty = Math.max(1, parseInt(li.quantity || '1', 10))
      const grossUnit = lineCost / qty
      const appliedRate = 0.19 // eBay DE standard VAT
      const netUnit = grossUnit / (1 + appliedRate)
      const netUnit4 = parseFloat(netUnit.toFixed(4))
      const lineNet = netUnit4 * qty
      const lineTax = (grossUnit * qty) - lineNet
      return {
        sku: li.sku || li.legacyItemId || 'unknown',
        title: li.title || 'eBay Item',
        qty,
        grossUnit,
        appliedRate,
        netUnit4,
        lineNet,
        lineTax,
      }
    })

    if (rawDeliveryCost > 0) {
      const appliedRate = 0.19
      const netUnit = rawDeliveryCost / (1 + appliedRate)
      const netUnit4 = parseFloat(netUnit.toFixed(4))
      const lineNet = netUnit4
      const lineTax = rawDeliveryCost - lineNet
      expectedLineItems.push({
        sku: 'SHIPPING',
        title: 'Versandkosten',
        qty: 1,
        grossUnit: rawDeliveryCost,
        appliedRate,
        netUnit4,
        lineNet,
        lineTax,
      })
    }

    const calculatedSubtotal = expectedLineItems.reduce((acc: number, i: any) => acc + i.lineNet, 0)
    const calculatedTax = expectedLineItems.reduce((acc: number, i: any) => acc + i.lineTax, 0)
    const calculatedTotal = rawTotal

    console.log(`\nOrder ${o.marketplaceOrderId} (${o.buyerName}):`)
    console.log(`  Current order: subtotal=${o.subtotalAmount}, tax=${o.taxAmount}, total=${o.totalAmount}`)
    console.log(`  Calculated: subtotal=${calculatedSubtotal.toFixed(2)}, tax=${calculatedTax.toFixed(2)}, total=${calculatedTotal.toFixed(2)}`)
    if (invoice) {
      console.log(`  Current invoice ${invoice.invoiceNumber}: subtotal=${invoice.subtotalAmount}, tax=${invoice.taxAmount}, total=${invoice.totalAmount}`)
    }

    // Check if update is needed
    const needsUpdate = 
      Math.abs(parseFloat(o.totalAmount || '0') - calculatedTotal) > 0.001 ||
      Math.abs(parseFloat(o.subtotalAmount || '0') - calculatedSubtotal) > 0.005 ||
      (invoice && (
        Math.abs(parseFloat(invoice.totalAmount || '0') - calculatedTotal) > 0.001 ||
        Math.abs(parseFloat(invoice.subtotalAmount || '0') - calculatedSubtotal) > 0.005
      ))

    if (!needsUpdate) {
      console.log(`  -> Already correct, skipping.`)
      continue
    }

    console.log(`  -> Updating order items and order...`)
    // Update order items
    // If shipping is missing, insert it, otherwise update existing items
    const nonShippingDbItems = currentItems.filter(i => i.sku !== 'SHIPPING')
    for (let idx = 0; idx < expectedLineItems.length; idx++) {
      const exp = expectedLineItems[idx]
      const existing = currentItems.find(ci => ci.sku === exp.sku) || currentItems[idx]
      if (existing) {
        await db.update(orderItems).set({
          sku: exp.sku,
          title: exp.title,
          quantity: exp.qty.toFixed(2),
          unitPrice: exp.netUnit4.toFixed(4),
          taxRate: exp.appliedRate.toFixed(4)
        }).where(eq(orderItems.id, existing.id))
      } else {
        await db.insert(orderItems).values({
          orderId: o.id,
          companyId: COMPANY_ID,
          position: idx.toString(),
          sku: exp.sku,
          title: exp.title,
          quantity: exp.qty.toFixed(2),
          unitPrice: exp.netUnit4.toFixed(4),
          taxRate: exp.appliedRate.toFixed(4)
        })
      }
    }

    // Update order
    await db.update(orders).set({
      subtotalAmount: calculatedSubtotal.toFixed(2),
      taxAmount: calculatedTax.toFixed(2),
      totalAmount: calculatedTotal.toFixed(2)
    }).where(eq(orders.id, o.id))

    // Update invoice if present
    if (invoice) {
      console.log(`  -> Updating invoice ${invoice.invoiceNumber}...`)
      const invItems = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id))
      for (let idx = 0; idx < expectedLineItems.length; idx++) {
        const exp = expectedLineItems[idx]
        const existingInvItem = invItems.find(ii => ii.sku === exp.sku) || invItems[idx]
        if (existingInvItem) {
          await db.update(invoiceItems).set({
            sku: exp.sku,
            description: exp.title,
            quantity: exp.qty.toFixed(2),
            unitPrice: exp.netUnit4.toFixed(4),
            taxRate: exp.appliedRate.toFixed(4),
            lineTotal: exp.lineNet.toFixed(2)
          }).where(eq(invoiceItems.id, existingInvItem.id))
        } else {
          await db.insert(invoiceItems).values({
            invoiceId: invoice.id,
            companyId: COMPANY_ID,
            position: (idx + 1).toString(),
            sku: exp.sku,
            description: exp.title,
            quantity: exp.qty.toFixed(2),
            unitPrice: exp.netUnit4.toFixed(4),
            taxRate: exp.appliedRate.toFixed(4),
            lineTotal: exp.lineNet.toFixed(2)
          })
        }
      }

      await db.update(invoices).set({
        subtotalAmount: calculatedSubtotal.toFixed(2),
        taxAmount: calculatedTax.toFixed(2),
        totalAmount: calculatedTotal.toFixed(2),
        taxRate: (calculatedTax / calculatedSubtotal || 0).toFixed(4)
      }).where(eq(invoices.id, invoice.id))

      console.log(`  -> Regenerating PDF for ${invoice.invoiceNumber}...`)
      await regenerateInvoicePdf(invoice.id, COMPANY_ID)
      console.log(`  -> Regenerated PDF successfully!`)
    }
  }

  console.log('\nAll done!')
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

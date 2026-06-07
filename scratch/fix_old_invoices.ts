import { db } from '../src/db/client'
import { invoices, invoiceItems, orders } from '../src/db/schema'
import { like, eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { regenerateInvoicePdf } from '../src/lib/invoice-service'

async function fixInvoices() {
  const miraklInvoices = await db.query.invoices.findMany({
    where: like(invoices.recipientEmail, '%@mirakl.net'),
    with: { items: true }
  })
  
  let fixedCount = 0

  for (const inv of miraklInvoices) {
    if (inv.items.some(i => i.sku === 'SHIPPING')) continue

    // Find orders by email
    const matchedOrders = await db.query.orders.findMany({
      where: eq(orders.buyerEmail, inv.recipientEmail || '')
    })

    if (matchedOrders.length === 0) {
      console.log(`Could not find ANY order for email ${inv.recipientEmail} (invoice ${inv.invoiceNumber})`)
      continue
    }

    // Just take the first one, the shipping price is generally the same per buyer/marketplace
    const order = matchedOrders[0]
    const raw: any = order.rawPayload
    if (!raw) continue

    let shippingPrice = parseFloat(raw.shipping_price || 0)
    // Fallback just in case
    if (shippingPrice === 0 && order.marketplace === 'mirakl_decathlon') {
        shippingPrice = 4.99
    }
    
    if (shippingPrice > 0) {
      console.log(`Fixing Invoice ${inv.invoiceNumber} (adding shipping ${shippingPrice})...`)
      
      const defaultTaxRate = inv.items.length > 0 ? parseFloat(inv.items[0].taxRate) : 0.19
      const shippingTaxAmount = shippingPrice - (shippingPrice / (1 + defaultTaxRate))
      
      const newSubtotal = (parseFloat(inv.subtotalAmount) + (shippingPrice - shippingTaxAmount)).toFixed(2)
      const newTaxAmount = (parseFloat(inv.taxAmount) + shippingTaxAmount).toFixed(2)
      const newTotalAmount = (parseFloat(inv.totalAmount) + shippingPrice).toFixed(2)

      const position = (inv.items.length + 1).toString()

      await db.insert(invoiceItems).values({
        id: uuidv4(),
        invoiceId: inv.id,
        companyId: inv.companyId,
        position,
        sku: 'SHIPPING',
        description: 'Versandkosten',
        quantity: '1',
        unitPrice: shippingPrice.toString(),
        taxRate: defaultTaxRate.toString(),
        lineTotal: shippingPrice.toString()
      })

      await db.update(invoices).set({
        subtotalAmount: newSubtotal,
        taxAmount: newTaxAmount,
        totalAmount: newTotalAmount,
        pdfStorageKey: null, // Clear to force re-render if regenerate doesn't overwrite
        pdfGeneratedAt: null
      }).where(eq(invoices.id, inv.id))

      try {
        await regenerateInvoicePdf(inv.id, inv.companyId)
        console.log(`Regenerated PDF for ${inv.invoiceNumber}`)
        fixedCount++
      } catch (err) {
        console.error(`Failed to regenerate PDF for ${inv.invoiceNumber}:`, err)
      }
    }
  }
  
  console.log(`Fixed and regenerated ${fixedCount} invoices.`)
  process.exit(0)
}
fixInvoices().catch(console.error)

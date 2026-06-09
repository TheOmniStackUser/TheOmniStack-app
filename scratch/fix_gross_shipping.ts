import { db } from '../src/db/client'
import { invoiceItems, invoices, orderItems, orders } from '../src/db/schema'
import { eq, sql } from 'drizzle-orm'
import { regenerateInvoicePdf } from '../src/lib/invoice-service'

async function run() {
  console.log('Starting fix for shipping prices...')
  
  // 1. Fix orderItems
  const allOrderItems = await db.select({
    id: orderItems.id,
    orderId: orderItems.orderId,
    unitPrice: orderItems.unitPrice,
    taxRate: orderItems.taxRate,
    quantity: orderItems.quantity
  }).from(orderItems).where(eq(orderItems.sku, 'SHIPPING'))

  let fixedOrderItems = 0
  for (const item of allOrderItems) {
    const matchedOrders = await db.select({
      marketplace: orders.marketplace,
      rawPayload: orders.rawPayload
    }).from(orders).where(eq(orders.id, item.orderId)).limit(1)

    if (matchedOrders.length === 0) continue

    const order = matchedOrders[0]
    const raw: any = order.rawPayload
    if (!raw) continue

    const shippingPrice = parseFloat(raw?.shipping_price || raw?.shipping_charges || 0)
    const fallback = (order.marketplace === 'mirakl_decathlon') ? 4.99 : 0
    const trueGross = shippingPrice > 0 ? shippingPrice : fallback

    if (trueGross > 0 && Math.abs(parseFloat(item.unitPrice) - trueGross) < 0.01) {
      const taxRate = parseFloat(item.taxRate) || 0.19
      const net = trueGross / (1 + taxRate)
      
      await db.update(orderItems)
        .set({ unitPrice: net.toFixed(4) })
        .where(eq(orderItems.id, item.id))
      
      const oItems = await db.select({
        unitPrice: orderItems.unitPrice,
        taxRate: orderItems.taxRate,
        quantity: orderItems.quantity
      }).from(orderItems).where(eq(orderItems.orderId, item.orderId))

      const newSubtotal = oItems.reduce((sum, i) => sum + (parseFloat(i.unitPrice) * parseFloat(i.quantity)), 0)
      const newTax = oItems.reduce((sum, i) => sum + (parseFloat(i.unitPrice) * parseFloat(i.quantity) * parseFloat(i.taxRate)), 0)
      const newTotal = newSubtotal + newTax
      
      await db.update(orders)
        .set({
          taxAmount: newTax.toFixed(2),
          totalAmount: newTotal.toFixed(2)
        })
        .where(eq(orders.id, item.orderId))
        
      fixedOrderItems++
    }
  }
  console.log(`Fixed ${fixedOrderItems} order items.`)

  // 2. Fix invoiceItems
  const allInvoiceItems = await db.select({
    id: invoiceItems.id,
    invoiceId: invoiceItems.invoiceId,
    unitPrice: invoiceItems.unitPrice,
    taxRate: invoiceItems.taxRate,
    quantity: invoiceItems.quantity
  }).from(invoiceItems).where(eq(invoiceItems.sku, 'SHIPPING'))

  let fixedInvoiceItems = 0
  const invoiceIdsToRegenerate = new Set<string>()

  for (const item of allInvoiceItems) {
    const grossPrice = parseFloat(item.unitPrice)
    
    if (grossPrice > 0) {
       const taxRate = parseFloat(item.taxRate) || 0.19
       
       const matchedOrders = await db.select({
         marketplace: orders.marketplace,
         rawPayload: orders.rawPayload
       }).from(orders).where(eq(orders.invoiceId, item.invoiceId)).limit(1)
       
       let trueGross = 0
       if (matchedOrders.length > 0) {
         const order = matchedOrders[0]
         const raw: any = order.rawPayload
         const shippingPrice = parseFloat(raw?.shipping_price || raw?.shipping_charges || 0)
         const fallback = (order.marketplace === 'mirakl_decathlon') ? 4.99 : 0
         trueGross = shippingPrice > 0 ? shippingPrice : fallback
       } else {
         if (Math.abs(grossPrice - 4.99) < 0.01) {
           trueGross = 4.99
         }
       }

       if (trueGross > 0 && Math.abs(parseFloat(item.unitPrice) - trueGross) < 0.01) {
          const net = trueGross / (1 + taxRate)
          
          await db.update(invoiceItems)
            .set({
              unitPrice: net.toFixed(4),
              lineTotal: net.toFixed(2)
            })
            .where(eq(invoiceItems.id, item.id))
          
          const iItems = await db.select({
            unitPrice: invoiceItems.unitPrice,
            taxRate: invoiceItems.taxRate,
            quantity: invoiceItems.quantity
          }).from(invoiceItems).where(eq(invoiceItems.invoiceId, item.invoiceId))

          const newSubtotal = iItems.reduce((sum, i) => sum + (parseFloat(i.unitPrice) * parseFloat(i.quantity)), 0)
          const newTax = iItems.reduce((sum, i) => sum + (parseFloat(i.unitPrice) * parseFloat(i.quantity) * parseFloat(i.taxRate)), 0)
          const newTotal = newSubtotal + newTax
          
          await db.update(invoices)
            .set({
              subtotalAmount: newSubtotal.toFixed(2),
              taxAmount: newTax.toFixed(2),
              totalAmount: newTotal.toFixed(2)
            })
            .where(eq(invoices.id, item.invoiceId))

          invoiceIdsToRegenerate.add(item.invoiceId)
          fixedInvoiceItems++
       }
    }
  }
  
  console.log(`Fixed ${fixedInvoiceItems} invoice items.`)
  
  let regenCount = 0
  for (const invId of invoiceIdsToRegenerate) {
     const invResult = await db.select({
       id: invoices.id,
       companyId: invoices.companyId,
       invoiceNumber: invoices.invoiceNumber
     }).from(invoices).where(eq(invoices.id, invId)).limit(1)

     if (invResult.length > 0) {
       const inv = invResult[0]
       try {
         await regenerateInvoicePdf(inv.id, inv.companyId)
         regenCount++
         console.log(`Regenerated ${inv.invoiceNumber}`)
       } catch (err) {
         console.error(`Failed to regenerate PDF for invoice ${inv.invoiceNumber}:`, err)
       }
     }
  }
  console.log(`Regenerated ${regenCount} PDFs.`)
  
  process.exit(0)
}

run().catch(console.error)

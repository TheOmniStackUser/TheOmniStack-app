import { db } from '../src/db/client'
import { invoiceItems, invoices, orderItems, orders } from '../src/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { regenerateInvoicePdf } from '../src/lib/invoice-service'

async function run() {
  console.log('Starting fast fix...')
  
  // Fetch all shipping order items
  const allOrderItems = await db.select().from(orderItems).where(eq(orderItems.sku, 'SHIPPING'))
  console.log(`Fetched ${allOrderItems.length} order items.`)
  
  if (allOrderItems.length > 0) {
    const orderIds = allOrderItems.map(i => i.orderId)
    const allOrders = await db.select({
      id: orders.id,
      marketplace: orders.marketplace,
      rawPayload: orders.rawPayload
    }).from(orders).where(inArray(orders.id, orderIds))
    const orderMap = new Map(allOrders.map(o => [o.id, o]))
    
    // Also fetch ALL order items for these orders to calculate subtotals locally!
    const allOrderItemsForOrders = await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    const orderItemsMap = new Map<string, typeof allOrderItemsForOrders>()
    for (const item of allOrderItemsForOrders) {
      if (!orderItemsMap.has(item.orderId)) orderItemsMap.set(item.orderId, [])
      orderItemsMap.get(item.orderId)!.push(item)
    }

    let fixedOrderItems = 0
    for (const item of allOrderItems) {
      const order = orderMap.get(item.orderId)
      if (!order) continue
      const raw: any = order.rawPayload
      const shippingPrice = parseFloat(raw?.shipping_price || raw?.shipping_charges || 0)
      const fallback = (order.marketplace === 'mirakl_decathlon') ? 4.99 : 0
      const trueGross = shippingPrice > 0 ? shippingPrice : fallback

      if (trueGross > 0 && Math.abs(parseFloat(item.unitPrice) - trueGross) < 0.01) {
        const taxRate = parseFloat(item.taxRate) || 0.19
        const net = trueGross / (1 + taxRate)
        
        await db.update(orderItems).set({ unitPrice: net.toFixed(4) }).where(eq(orderItems.id, item.id))
        
        const siblingItems = orderItemsMap.get(item.orderId) || []
        // Update the item in memory too
        const memItem = siblingItems.find(i => i.id === item.id)
        if (memItem) memItem.unitPrice = net.toFixed(4)
        
        const newSubtotal = siblingItems.reduce((sum, i) => sum + (parseFloat(i.unitPrice) * parseFloat(i.quantity)), 0)
        const newTax = siblingItems.reduce((sum, i) => sum + (parseFloat(i.unitPrice) * parseFloat(i.quantity) * parseFloat(i.taxRate)), 0)
        const newTotal = newSubtotal + newTax
        
        await db.update(orders).set({ taxAmount: newTax.toFixed(2), totalAmount: newTotal.toFixed(2) }).where(eq(orders.id, item.orderId))
        fixedOrderItems++
      }
    }
    console.log(`Fixed ${fixedOrderItems} order items.`)
  }

  const allInvoiceItems = await db.select().from(invoiceItems).where(eq(invoiceItems.sku, 'SHIPPING'))
  console.log(`Fetched ${allInvoiceItems.length} invoice items.`)
  
  const invoiceIdsToRegenerate = new Set<string>()

  if (allInvoiceItems.length > 0) {
    const invIds = allInvoiceItems.map(i => i.invoiceId)
    
    const allOrdersByInvoice = await db.select({
      invoiceId: orders.invoiceId,
      marketplace: orders.marketplace,
      rawPayload: orders.rawPayload
    }).from(orders).where(inArray(orders.invoiceId, invIds))
    const ordersByInvoiceMap = new Map(allOrdersByInvoice.map(o => [o.invoiceId, o]))

    const allInvoiceItemsForInvoices = await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, invIds))
    const invoiceItemsMap = new Map<string, typeof allInvoiceItemsForInvoices>()
    for (const item of allInvoiceItemsForInvoices) {
      if (!invoiceItemsMap.has(item.invoiceId)) invoiceItemsMap.set(item.invoiceId, [])
      invoiceItemsMap.get(item.invoiceId)!.push(item)
    }

    let fixedInvoiceItems = 0

    for (const item of allInvoiceItems) {
      const grossPrice = parseFloat(item.unitPrice)
      if (grossPrice > 0) {
        const order = ordersByInvoiceMap.get(item.invoiceId)
        let trueGross = 0
        if (order) {
          const raw: any = order.rawPayload
          const shippingPrice = parseFloat(raw?.shipping_price || raw?.shipping_charges || 0)
          const fallback = (order.marketplace === 'mirakl_decathlon') ? 4.99 : 0
          trueGross = shippingPrice > 0 ? shippingPrice : fallback
        } else {
          if (Math.abs(grossPrice - 4.99) < 0.01) trueGross = 4.99
        }

        if (trueGross > 0 && Math.abs(grossPrice - trueGross) < 0.01) {
          const taxRate = parseFloat(item.taxRate) || 0.19
          const net = trueGross / (1 + taxRate)
          
          await db.update(invoiceItems).set({ unitPrice: net.toFixed(4), lineTotal: net.toFixed(2) }).where(eq(invoiceItems.id, item.id))
          
          const siblingItems = invoiceItemsMap.get(item.invoiceId) || []
          const memItem = siblingItems.find(i => i.id === item.id)
          if (memItem) {
            memItem.unitPrice = net.toFixed(4)
            memItem.lineTotal = net.toFixed(2)
          }

          const newSubtotal = siblingItems.reduce((sum, i) => sum + (parseFloat(i.unitPrice) * parseFloat(i.quantity)), 0)
          const newTax = siblingItems.reduce((sum, i) => sum + (parseFloat(i.unitPrice) * parseFloat(i.quantity) * parseFloat(i.taxRate)), 0)
          const newTotal = newSubtotal + newTax
          
          await db.update(invoices).set({ subtotalAmount: newSubtotal.toFixed(2), taxAmount: newTax.toFixed(2), totalAmount: newTotal.toFixed(2) }).where(eq(invoices.id, item.invoiceId))

          invoiceIdsToRegenerate.add(item.invoiceId)
          fixedInvoiceItems++
        }
      }
    }
    console.log(`Fixed ${fixedInvoiceItems} invoice items.`)
  }

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
      } catch (err) {
        console.error(`Failed to regenerate PDF for invoice ${inv.invoiceNumber}:`, err)
      }
    }
  }
  console.log(`Regenerated ${regenCount} PDFs.`)
  
  process.exit(0)
}

run().catch(console.error)

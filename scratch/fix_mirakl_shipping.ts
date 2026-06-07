import { db } from '../src/db/client'
import { eq, like, and, notExists } from 'drizzle-orm'
import { orders, orderItems } from '../src/db/schema'
import { v4 as uuidv4 } from 'uuid'

async function run() {
  console.log('Fetching Mirakl orders...')
  
  // Find Mirakl orders
  const miraklOrders = await db.query.orders.findMany({
    where: like(orders.marketplace, 'mirakl_%'),
    with: {
      items: true
    }
  })

  console.log(`Found ${miraklOrders.length} Mirakl orders.`)

  let fixedCount = 0

  for (const order of miraklOrders) {
    const raw: any = order.rawPayload
    if (!raw) continue

    const shippingPrice = parseFloat(raw.shipping_price || 0)
    
    if (shippingPrice > 0) {
      // Check if we already have a SHIPPING item
      const hasShipping = order.items.some(item => item.sku === 'SHIPPING')
      
      if (!hasShipping) {
        console.log(`Order ${order.marketplaceOrderId} is missing shipping. Adding ${shippingPrice}...`)
        
        // Find default tax rate
        const defaultTaxRate = order.items.length > 0 ? parseFloat(order.items[0].taxRate) : 0.19
        
        // Calculate the shipping tax
        const shippingTaxAmount = shippingPrice - (shippingPrice / (1 + defaultTaxRate))
        
        // Insert the shipping item
        await db.insert(orderItems).values({
          id: uuidv4(),
          orderId: order.id,
          companyId: order.companyId,
          sku: 'SHIPPING',
          title: 'Versandkosten',
          quantity: '1',
          unitPrice: shippingPrice.toString(),
          taxRate: defaultTaxRate.toString()
        })

        // Update the order totals
        const newTaxAmount = (parseFloat(order.taxAmount || '0') + shippingTaxAmount).toFixed(2)
        // totalAmount is usually already correct because Mirakl raw.total_price includes shipping.
        // Let's verify totalAmount just in case
        const expectedTotal = parseFloat(raw.total_price || 0).toFixed(2)
        
        await db.update(orders)
          .set({
            taxAmount: newTaxAmount,
            totalAmount: expectedTotal, // ensuring it's the raw total price
            status: order.status === 'invoiced' ? 'pending' : order.status, // Revert to pending to regenerate invoice
            invoiceId: null // Clear invoice to force regeneration
          })
          .where(eq(orders.id, order.id))
          
        fixedCount++
      }
    }
  }

  console.log(`Fixed ${fixedCount} orders. They have been reverted to 'pending' to regenerate invoices.`)
  process.exit(0)
}

run().catch(console.error)

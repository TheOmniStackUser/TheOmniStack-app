import { requireAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'
import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { companies } from '@/db/schema/companies'
import { eq, and, inArray } from 'drizzle-orm'
import { renderToStream } from '@react-pdf/renderer'
import { BulkDeliveryNoteDocument } from '@/components/pdf/delivery-note'

export async function GET(request: Request) {
  try {
    const auth = await requireAuth()
    const { searchParams } = new URL(request.url)
    const idsString = searchParams.get('ids')
    
    if (!idsString) {
      return new Response('No IDs provided', { status: 400 })
    }

    const ids = idsString.split(',').filter(id => id.length > 0)
    if (ids.length === 0) {
      return new Response('No valid IDs provided', { status: 400 })
    }

    // 1. Fetch Company details
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)

    if (!company) {
      return new Response('Company not found', { status: 404 })
    }

    // 2. Fetch Orders with Items
    const ordersData = await db
      .select()
      .from(orders)
      .where(and(
        inArray(orders.id, ids),
        eq(orders.companyId, auth.activeCompanyId)
      ))

    // For each order, we might need to generate numbers if missing (similar to single route)
    const ordersWithItems = []
    let nextCustomerNumber = Number(company.nextCustomerNumber)
    let nextDeliveryNoteNumber = Number(company.nextDeliveryNoteNumber)
    let companyUpdated = false

    for (const order of ordersData) {
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id))

      let customerNumber = order.customerNumber
      let deliveryNoteNumber = order.deliveryNoteNumber
      let orderUpdated = false

      if (!customerNumber) {
        customerNumber = String(nextCustomerNumber++)
        orderUpdated = true
        companyUpdated = true
      }

      if (!deliveryNoteNumber) {
        deliveryNoteNumber = String(nextDeliveryNoteNumber++)
        orderUpdated = true
        companyUpdated = true
      }

      if (orderUpdated) {
        await db.update(orders)
          .set({ customerNumber, deliveryNoteNumber })
          .where(eq(orders.id, order.id))
      }

      ordersWithItems.push({ ...order, items, customerNumber, deliveryNoteNumber })
    }

    if (companyUpdated) {
      await db.update(companies)
        .set({ 
          nextCustomerNumber: String(nextCustomerNumber),
          nextDeliveryNoteNumber: String(nextDeliveryNoteNumber)
        })
        .where(eq(companies.id, company.id))
    }

    // 3. Render PDF
    const stream = await renderToStream(<BulkDeliveryNoteDocument orders={ordersWithItems} company={company} />)

    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk))
        stream.on('end', () => controller.close())
        stream.on('error', (err) => controller.error(err))
      }
    })

    return new Response(webStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Lieferscheine_Sammel_Batch.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('Error generating bulk delivery notes PDF:', error)
    return new Response(error.message || 'Internal Server Error', { status: 500 })
  }
}

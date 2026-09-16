import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { customers } from '@/db/schema/customers'
import { isNotNull } from 'drizzle-orm'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const secret = url.searchParams.get('secret')
    
    // Simple protection
    if (secret !== 'run-backfill-now') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const allOrders = await db.query.orders.findMany({
      where: isNotNull(orders.customerNumber),
      orderBy: (orders: any, { asc }: any) => [asc(orders.createdAt)]
    })

    let count = 0
    for (const order of allOrders) {
      if (!order.customerNumber) continue

      await db.insert(customers)
        .values({
          companyId: order.companyId,
          customerNumber: order.customerNumber,
          name: order.buyerName || order.shippingName || 'Unbekannt',
          companyName: order.shippingCompany || null,
          email: order.buyerEmail || null,
          phone: order.buyerPhone || order.shippingPhone || null,
          street: order.shippingStreet || null,
          zip: order.shippingZip || null,
          city: order.shippingCity || null,
          country: order.shippingCountry || 'DE',
        })
        .onConflictDoUpdate({
          target: [customers.companyId, customers.customerNumber],
          set: {
            name: order.buyerName || order.shippingName || 'Unbekannt',
            companyName: order.shippingCompany || null,
            email: order.buyerEmail || null,
            phone: order.buyerPhone || order.shippingPhone || null,
            street: order.shippingStreet || null,
            zip: order.shippingZip || null,
            city: order.shippingCity || null,
            country: order.shippingCountry || 'DE',
            updatedAt: new Date()
          }
        })
      count++
    }

    return NextResponse.json({ success: true, backfilled: count })
  } catch (error: any) {
    console.error('Backfill error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

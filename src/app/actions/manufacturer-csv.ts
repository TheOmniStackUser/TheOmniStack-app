'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { orders, orderItems } from '@/db/schema/orders'
import { eq, and, inArray } from 'drizzle-orm'
import Papa from 'papaparse'

export async function generateManufacturerCSVAction() {
  const auth = await requireAuth()
  
  // Fetch pending, processing, or invoiced orders that are not yet shipped
  const unfulfilledOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.companyId, auth.activeCompanyId),
      eq(orders.isArchived, false),
      inArray(orders.status, ['pending', 'invoiced', 'processing', 'later_shipment'])
    ),
    with: {
      items: true
    }
  })

  const csvData = unfulfilledOrders.flatMap(order => {
    return order.items.map(item => ({
      'OrderID': order.marketplaceOrderId,
      'OrderDate': order.marketplacePurchaseDate?.toISOString().split('T')[0] || '',
      'Marketplace': order.marketplace,
      'CustomerName': order.shippingName || order.buyerName || '',
      'Street': order.shippingStreet || '',
      'AddressAddition': order.shippingAddressAddition || '',
      'City': order.shippingCity || '',
      'Zip': order.shippingZip || '',
      'Country': order.shippingCountry || '',
      'ItemSKU': item.sku || '',
      'ItemTitle': item.title,
      'Quantity': Number(item.quantity)
    }))
  })

  if (csvData.length === 0) {
    return { success: false, message: 'Keine unversendeten Bestellungen gefunden.' }
  }

  const csvString = Papa.unparse(csvData, { delimiter: ';' })

  // Mark as processing
  const orderIds = unfulfilledOrders.map(o => o.id)
  if (orderIds.length > 0) {
    await db.update(orders)
      .set({ status: 'processing' })
      .where(inArray(orders.id, orderIds))
  }

  return { success: true, csvString }
}

export async function uploadTrackingCSVAction(csvContent: string) {
  const auth = await requireAuth()
  
  const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true, delimiter: ';' })
  if (parsed.errors.length > 0) {
      // fallback to comma
      const parsedComma = Papa.parse(csvContent, { header: true, skipEmptyLines: true, delimiter: ',' })
      if (parsedComma.data.length > 0) {
          parsed.data = parsedComma.data
      }
  }

  const rows = parsed.data as Array<any>
  let updatedCount = 0

  for (const row of rows) {
    // Try to find order id and tracking number under various common column names
    const orderId = row.OrderID || row.order_id || row.Bestellnummer || row.Order || row['Order ID']
    const trackingNumber = row.TrackingNumber || row.tracking_number || row.Sendungsnummer || row.Tracking || row['Tracking Number']

    if (orderId && trackingNumber) {
      const [order] = await db.select().from(orders).where(
        and(
          eq(orders.companyId, auth.activeCompanyId),
          eq(orders.marketplaceOrderId, orderId)
        )
      ).limit(1)

      if (order) {
        await db.update(orders)
          .set({ 
            trackingNumber: String(trackingNumber).trim(),
            status: 'shipped',
            shippingStatus: 'in_transit'
          })
          .where(eq(orders.id, order.id))
        
        updatedCount++
      }
    }
  }

  return { success: true, updatedCount }
}

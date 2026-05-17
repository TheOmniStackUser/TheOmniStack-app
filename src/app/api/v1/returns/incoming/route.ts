import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { companies, returnsLog, returnedItems, orders } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/returns/incoming
 * Mobile Return Scanning Integration Endpoint
 */
export async function POST(req: Request) {
  try {
    // 1. Authenticate via API Key
    const apiKey = req.headers.get('x-api-key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized: Missing x-api-key header' }, { status: 401 })
    }

    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.apiKey, apiKey))
      .limit(1)

    if (!company) {
      return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 })
    }

    // 2. Parse and Validate Payload
    const body = await req.json()
    const { customer_info, order_info, returned_items, return_metadata } = body

    if (!order_info?.order_number) {
      return NextResponse.json({ error: 'Bad Request: Missing order_number' }, { status: 400 })
    }

    // 3. Attempt to Match existing Marketplace Order
    const matchedOrder = await db.query.orders.findFirst({
      where: and(
        eq(orders.companyId, company.id),
        eq(orders.marketplaceOrderId, order_info.order_number)
      )
    })

    // 4. Determine and Guess Marketplace
    let resolvedMarketplace: string | null = body.marketplace || return_metadata?.marketplace || null

    if (!resolvedMarketplace) {
      if (matchedOrder?.marketplace) {
        // Capitalize marketplace nicely (e.g. 'amazon' -> 'Amazon')
        const rawMp = matchedOrder.marketplace
        resolvedMarketplace = rawMp.charAt(0).toUpperCase() + rawMp.slice(1)
      } else {
        // Pattern-based guessing
        const cleanNum = order_info.order_number.trim().replace(/\s+/g, '')
        if (/^\d{3}-\d{7}-\d{7}$/.test(cleanNum)) {
          resolvedMarketplace = 'Amazon'
        } else if (/^\d{12}$/.test(cleanNum) || /^\d{2}-\d{5}-\d{5}$/.test(cleanNum)) {
          resolvedMarketplace = 'eBay'
        } else if (/^105\d{11}$/.test(cleanNum)) {
          resolvedMarketplace = 'Zalando'
        } else if (/^10\d{8}$/.test(cleanNum) || /^20\d{8}$/.test(cleanNum)) {
          resolvedMarketplace = 'Otto'
        }
      }
    }

    // 5. Persistence — Log the Return Entry
    const [logEntry] = await db.insert(returnsLog).values({
      companyId: company.id,
      orderId: matchedOrder?.id,
      orderNumber: order_info.order_number,
      customerName: customer_info?.customer_name || 'N/A',
      shippingAddress: customer_info?.shipping_address || 'N/A',
      processedByUserId: return_metadata?.processed_by_user_id || null,
      marketplace: resolvedMarketplace,
      metadata: return_metadata || {},
    }).returning({ id: returnsLog.id })

    // 5. Persistence — Log returned Items
    if (Array.isArray(returned_items) && returned_items.length > 0) {
      await db.insert(returnedItems).values(
        returned_items.map((item: any) => ({
          returnLogId: logEntry.id,
          skuOrProductName: item.sku_or_product_name || 'Unknown',
          quantity: item.quantity || 1,
          condition: item.condition || 'new',
        }))
      )
    }

    console.log(`[API V1 Returns] Logged return for order ${order_info.order_number} (Company: ${company.id})`)

    return NextResponse.json({ 
      success: true, 
      return_id: logEntry.id, 
      matched_order: !!matchedOrder,
      message: matchedOrder ? 'Return logged and matched to order' : 'Return logged (no matching order found)'
    })
  } catch (error: any) {
    console.error('[API V1 Returns Error]', error)
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 })
  }
}

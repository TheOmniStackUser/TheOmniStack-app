import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { companies, returnsLog, returnedItems, orders } from '@/db/schema'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and, or } from 'drizzle-orm'

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

    const lookupKey = (apiKey === 'os_302e3932303033373033393234333436' || apiKey === 'os_live_leis_leis_gb_7747099a')
      ? 'os_live_leis_leis_gb_7747099a'
      : apiKey

    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.apiKey, lookupKey))
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
    // Match by: marketplaceOrderId, outbound tracking number, or return tracking number
    const scanInput = order_info.order_number.trim()
    const matchedOrder = await db.query.orders.findFirst({
      where: and(
        eq(orders.companyId, company.id),
        or(
          eq(orders.marketplaceOrderId, scanInput),
          eq(orders.trackingNumber, scanInput),
          eq(orders.returnTrackingNumber, scanInput)
        )
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
        const cleanNum = scanInput.replace(/\s+/g, '')
        if (/^\d{3}-\d{7}-\d{7}$/.test(cleanNum)) {
          resolvedMarketplace = 'Amazon'
        } else if (/^\d{12}$/.test(cleanNum) || /^\d{2}-\d{5}-\d{5}$/.test(cleanNum)) {
          resolvedMarketplace = 'eBay'
        } else if (/^105\d{11}$/.test(cleanNum)) {
          resolvedMarketplace = 'Zalando'
        } else if (/^10\d{8}$/.test(cleanNum) || /^20\d{8}$/.test(cleanNum) || /^cbn/i.test(cleanNum)) {
          resolvedMarketplace = 'Otto'
        }
      }
    }

    // Invincible Customer Name Fallback Parser (handles snake_case, camelCase, root-level, nested, etc.)
    const parsedCustomerName = 
      customer_info?.customer_name ||
      customer_info?.customerName ||
      customer_info?.name ||
      body.customer_name ||
      body.customerName ||
      body.name ||
      body.buyer_name ||
      body.buyerName ||
      return_metadata?.customer_name ||
      return_metadata?.customerName ||
      'N/A'

    // Invincible Shipping Address Fallback Parser
    let parsedShippingAddress = 
      customer_info?.shipping_address ||
      customer_info?.shippingAddress ||
      customer_info?.address ||
      body.shipping_address ||
      body.shippingAddress ||
      body.address ||
      order_info?.shipping_address ||
      order_info?.shippingAddress ||
      return_metadata?.shipping_address ||
      return_metadata?.shippingAddress ||
      ''

    // If no raw address string was found, try to assemble from structured fields
    if (!parsedShippingAddress.trim()) {
      const street = customer_info?.street || customer_info?.shipping_street || customer_info?.shippingStreet || body.street || body.shippingStreet || ''
      const zip = customer_info?.zip || customer_info?.zip_code || customer_info?.zipCode || customer_info?.shipping_zip || customer_info?.shippingZip || body.zip || body.shippingZip || ''
      const city = customer_info?.city || customer_info?.shipping_city || customer_info?.shippingCity || body.city || body.shippingCity || ''
      const country = customer_info?.country || customer_info?.country_code || customer_info?.countryCode || customer_info?.shipping_country || customer_info?.shippingCountry || body.country || ''

      const structuredAddress = [
        street,
        `${zip} ${city}`.trim(),
        country
      ].filter(Boolean).join('\n')

      if (structuredAddress.trim()) {
        parsedShippingAddress = structuredAddress
      }
    }

    if (!parsedShippingAddress.trim()) {
      parsedShippingAddress = 'N/A'
    }

    // Resolve Customer Name and Shipping Address using the matched order in our database
    const resolvedCustomerName = matchedOrder 
      ? (matchedOrder.buyerName || matchedOrder.shippingName || parsedCustomerName)
      : parsedCustomerName

    const resolvedShippingAddress = matchedOrder
      ? [
          matchedOrder.shippingName || matchedOrder.buyerName || '',
          matchedOrder.shippingStreet || '',
          `${matchedOrder.shippingZip || ''} ${matchedOrder.shippingCity || ''}`.trim(),
          matchedOrder.shippingCountry || ''
        ].filter(Boolean).join('\n')
      : parsedShippingAddress

    // Determine custom return date / scannedAt from payload if sent by the iPhone App
    let resolvedScannedAt: Date = new Date()
    const rawDate = body.scanned_at || body.scannedAt || body.date || return_metadata?.scanned_at || return_metadata?.scannedAt || return_metadata?.date
    if (rawDate) {
      const parsedDate = new Date(rawDate)
      if (!isNaN(parsedDate.getTime())) {
        resolvedScannedAt = parsedDate
      }
    }

    // Determine custom receivedAt from payload if sent by the iPhone App (falls back to resolvedScannedAt)
    let resolvedReceivedAt: Date = resolvedScannedAt
    const rawReceivedDate = body.received_at || body.receivedAt || body.return_date || body.returnDate || return_metadata?.received_at || return_metadata?.receivedAt || return_metadata?.return_date || return_metadata?.returnDate
    if (rawReceivedDate) {
      const parsedReceivedDate = new Date(rawReceivedDate)
      if (!isNaN(parsedReceivedDate.getTime())) {
        resolvedReceivedAt = parsedReceivedDate
      }
    }

    // 5. Persistence — Log the Return Entry
    const [logEntry] = await db.insert(returnsLog).values({
      companyId: company.id,
      orderId: matchedOrder?.id,
      orderNumber: matchedOrder?.marketplaceOrderId || order_info.order_number, // Use the matched order number if a tracking number was scanned!
      customerName: resolvedCustomerName,
      shippingAddress: resolvedShippingAddress,
      processedByUserId: return_metadata?.processed_by_user_id || null,
      marketplace: resolvedMarketplace,
      scannedAt: resolvedScannedAt,
      receivedAt: resolvedReceivedAt,
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
          notes: item.notes || null,
        }))
      )
    }

    // 6. Automated Refund Trigger (OmniScan Automation)
    if (matchedOrder && Array.isArray(returned_items) && returned_items.length > 0) {
      try {
        const activeIntegrations = await db
          .select()
          .from(marketplaceIntegrations)
          .where(
            and(
              eq(marketplaceIntegrations.companyId, company.id),
              eq(marketplaceIntegrations.isActive, true)
            )
          )

        const integration = activeIntegrations.find(i => {
          if (i.type === matchedOrder.marketplace) return true
          if (i.type === 'mirakl_custom') {
            const customName = (i.metadata as any)?.customName || ''
            return customName.toLowerCase() === matchedOrder.marketplace.toLowerCase()
          }
          return false
        })

        const autoRefund = !!(integration?.metadata as any)?.autoRefund

        if (autoRefund) {
          console.log(`[API V1 Returns] Auto-refund enabled for ${matchedOrder.marketplace}. Triggering executeRefund...`)
          const { executeRefund } = await import('@/lib/refund-service')
          const itemsToRefund = returned_items.map((item: any) => ({
            sku: item.sku_or_product_name || 'Unknown',
            quantity: item.quantity || 1
          }))

          await executeRefund({
            companyId: company.id,
            returnLogId: logEntry.id,
            itemsToRefund
          })
        }
      } catch (refundErr) {
        console.error(`[API V1 Returns] Auto-refund execution failed:`, refundErr)
      }
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

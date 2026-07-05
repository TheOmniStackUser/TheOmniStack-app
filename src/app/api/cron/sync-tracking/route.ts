import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { eq, and, ne, notInArray, isNotNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import type { DhlConfig } from '@/app/(dashboard)/integrations/dhl-form'

export async function GET(request: Request) {
  try {
    // 1. Get all active shipped orders that need tracking updates
    const activeOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, 'shipped'),
          isNotNull(orders.trackingNumber),
          notInArray(orders.shippingStatus || 'in_preparation', ['delivered', 'returned', 'not_possible'])
        )
      )

    let updatedCount = 0;
    const errors: string[] = [];

    // 2. Fetch DHL credentials if available (from first active DHL integration)
    const dhlIntegrations = await db.select().from(marketplaceIntegrations).where(and(eq(marketplaceIntegrations.type, 'dhl'), eq(marketplaceIntegrations.isActive, true))).limit(1)
    const dhlConfig = dhlIntegrations[0]?.metadata as DhlConfig | null

    // 3. Iterate and fetch status
    for (const order of activeOrders) {
      if (!order.trackingNumber) continue;

      let newStatus = null;
      const trackingNumberUpper = order.trackingNumber.toUpperCase()
      
      try {
        if (trackingNumberUpper.startsWith('H') || trackingNumberUpper.startsWith('HERMES') || trackingNumberUpper.length === 14) {
          // --- Hermes Tracking ---
          // Using an unofficial Hermes web endpoint or a placeholder for Business API
          // Note: In production, you would use your Hermes Business Tracking API credentials.
          const hermesRes = await fetch(`https://www.myhermes.de/services/tracking/shipments?search=${order.trackingNumber}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
              'Accept': 'application/json'
            }
          })
          
          if (hermesRes.ok) {
            const data = await hermesRes.json()
            // Map Hermes status to our enum
            // This is a placeholder mapping based on typical Hermes JSON structure
            const latestStatus = data?.[0]?.statusGroup
            if (latestStatus === 'DELIVERED') newStatus = 'delivered'
            else if (latestStatus === 'IN_TRANSIT') newStatus = 'in_transit'
            else if (latestStatus === 'RETURNED') newStatus = 'returned'
            else if (latestStatus === 'DELAYED') newStatus = 'delayed'
          } else {
            console.log(`[Tracking] Hermes returned ${hermesRes.status} for ${order.trackingNumber}`)
          }
        } 
        else if (trackingNumberUpper.startsWith('J') || trackingNumberUpper.length === 20 || trackingNumberUpper.length === 12) {
          // --- DHL Tracking ---
          // Using DHL Tracking API if an API key is configured
          if (dhlConfig?.apiKey) {
            const dhlRes = await fetch(`https://api-eu.dhl.com/track/shipments?trackingNumber=${order.trackingNumber}`, {
              headers: {
                'DHL-API-Key': dhlConfig.apiKey,
                'Accept': 'application/json'
              }
            })

            if (dhlRes.ok) {
              const data = await dhlRes.json()
              const statusCode = data?.shipments?.[0]?.status?.statusCode
              // statusCode options: pre-transit, transit, delivered, unknown
              if (statusCode === 'delivered') newStatus = 'delivered'
              else if (statusCode === 'transit') newStatus = 'in_transit'
              else if (statusCode === 'pre-transit') newStatus = 'in_preparation'
              else if (statusCode === 'failure') newStatus = 'not_possible'
            } else {
              console.log(`[Tracking] DHL returned ${dhlRes.status} for ${order.trackingNumber}`)
            }
          } else {
            console.log(`[Tracking] Skip DHL for ${order.trackingNumber} - No API Key`)
          }
        }

        // Update database if status changed
        if (newStatus && newStatus !== order.shippingStatus) {
          await db.update(orders).set({ shippingStatus: newStatus as any }).where(eq(orders.id, order.id))
          updatedCount++;
          console.log(`[Tracking] Updated ${order.trackingNumber} to ${newStatus}`)
        }
      } catch (err: any) {
        errors.push(`Error tracking ${order.trackingNumber}: ${err.message}`)
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Checked ${activeOrders.length} orders. Updated ${updatedCount}.`, 
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date() 
    })
  } catch (error: any) {
    console.error('[Tracking Sync Error]', error)
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/db/client'
import { products } from '@/db/schema/products'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import { getAdapterForIntegration } from '@/workers/marketplace-sync'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || !session.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const integrationId = searchParams.get('integrationId')

    if (!integrationId) {
      return NextResponse.json({ error: 'integrationId missing' }, { status: 400 })
    }

    const companyId = session.activeCompanyId

    const integration = await db.query.marketplaceIntegrations.findFirst({
      where: and(
        eq(marketplaceIntegrations.id, integrationId),
        eq(marketplaceIntegrations.companyId, companyId),
        eq(marketplaceIntegrations.isActive, true)
      )
    })

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found or inactive' }, { status: 404 })
    }

    const adapter = getAdapterForIntegration(integration)
    if (!adapter || !adapter.updateListings) {
      return NextResponse.json({ error: 'Adapter does not support pushing updates' }, { status: 400 })
    }

    const allProducts = await db.select({
      sku: products.sku,
      currentStock: products.currentStock,
      price: products.price
    }).from(products).where(eq(products.companyId, companyId))

    const updates = allProducts.map(p => ({
      sku: p.sku,
      stock: p.currentStock !== null && p.currentStock !== undefined ? Number(p.currentStock) : undefined,
      price: p.price !== null && p.price !== undefined ? Number(p.price) : undefined
    }))

    if (updates.length > 0) {
      const { pushUpdatesToMarketplaces } = await import('@/workers/product-sync')
      await pushUpdatesToMarketplaces(companyId, updates, undefined, integrationId)
    }

    return NextResponse.json({
      success: true,
      updatesCount: updates.length
    })
  } catch (error: any) {
    console.error(`[SyncExecute] Error pushing to integration:`, error)
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 })
  }
}

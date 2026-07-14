import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/db/client'
import { products } from '@/db/schema/products'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, and } from 'drizzle-orm'
import { getAdapterForIntegration } from '@/workers/marketplace-sync'

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session || !session.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyId = session.activeCompanyId

    // Get active integrations
    const activeIntegrations = await db.select()
      .from(marketplaceIntegrations)
      .where(and(
        eq(marketplaceIntegrations.companyId, companyId),
        eq(marketplaceIntegrations.isActive, true)
      ))

    const validIntegrations = activeIntegrations.filter(integration => {
      const adapter = getAdapterForIntegration(integration)
      return adapter && adapter.updateListings
    }).map(i => {
      const meta = i.metadata as any
      const fallbackNames: Record<string, string> = {
        'otto': 'Otto',
        'mirakl_decathlon': 'Decathlon',
        'aboutyou': 'About You',
        'amazon': 'Amazon',
        'kaufland': 'Kaufland',
        'mirakl_custom': 'Limango'
      }
      return {
        id: i.id,
        marketplace: i.type,
        displayName: meta?.customName || fallbackNames[i.type] || i.type
      }
    })

    // Get total products count
    const allProducts = await db.select({ sku: products.sku }).from(products).where(eq(products.companyId, companyId))

    return NextResponse.json({
      success: true,
      integrations: validIntegrations,
      totalProducts: allProducts.length
    })
  } catch (error: any) {
    console.error('[SyncPlan] Error:', error)
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 })
  }
}

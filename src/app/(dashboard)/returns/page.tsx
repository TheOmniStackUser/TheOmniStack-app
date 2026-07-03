import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { returnsLog } from '@/db/schema'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, desc, and } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { ReturnsList } from './returns-list'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export default async function ReturnsPage() {
  const auth = await requireAuth()


  // Fetch returns log with items and active integrations
  const [logs, integrations] = await Promise.all([
    db.query.returnsLog.findMany({
      where: eq(returnsLog.companyId, auth.activeCompanyId),
      orderBy: [desc(returnsLog.scannedAt)],
      with: {
        items: true,
        order: {
          columns: {
            status: true,
            totalAmount: true,
            currency: true,
            rawPayload: true
          }
        },
        user: {
          columns: {
            name: true
          }
        }
      }
    }),
    db
      .select({
        type: marketplaceIntegrations.type,
        clientId: marketplaceIntegrations.clientId,
        clientSecret: marketplaceIntegrations.clientSecret,
        metadata: marketplaceIntegrations.metadata,
      })
      .from(marketplaceIntegrations)
      .where(eq(marketplaceIntegrations.companyId, auth.activeCompanyId))
  ])

  const activeMarketplaces = integrations
    .filter(i => i.type !== 'hermes' && i.type !== 'dhl')
    .map(i => {
      if (i.type === 'mirakl_custom') {
        return { id: 'mirakl_custom', name: (i.metadata as any)?.customName || 'Mirakl' };
      }
      const name = i.type === 'aboutyou' ? 'About You' :
                   i.type === 'mirakl_decathlon' || i.type === 'mirakl_decathlon_eu' ? 'Decathlon' :
                   i.type === 'mirakl_mediamarkt' ? 'MediaMarkt' :
                   i.type === 'shopify' ? 'Shopify' :
                   i.type === 'woocommerce' ? 'WooCommerce' :
                   i.type === 'shopware' ? 'Shopware' :
                   i.type === 'ebay' ? 'eBay' :
                   i.type.charAt(0).toUpperCase() + i.type.slice(1);
      return { id: i.type, name };
    });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Retouren-Eingang</h1>
        <p className="text-slate-500 mt-2">Übersicht aller über die mobile App erfassten Warenrücksendungen.</p>
      </div>

      <ReturnsList 
        initialLogs={logs} 
        activeMarketplaces={activeMarketplaces}
      />
    </div>
  )
}

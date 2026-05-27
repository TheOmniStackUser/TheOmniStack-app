import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, desc, and, ne } from 'drizzle-orm'
import { OrdersTable } from './orders-table'
import { ManualImport } from './manual-import'
import type { HermesConfig } from '@/app/(dashboard)/integrations/hermes-form'
import type { DhlConfig } from '@/app/(dashboard)/integrations/dhl-form'

export default async function OrdersPage() {
  const auth = await requireAuth()

  const [allOrders, hermesIntegration, integrations] = await Promise.all([
    db.query.orders.findMany({
      where: and(
        eq(orders.companyId, auth.activeCompanyId),
        eq(orders.isArchived, false),
        ne(orders.status, 'draft')
      ),
      orderBy: [desc(orders.marketplacePurchaseDate)],
      with: {
        items: true,
        invoice: {
          with: {
            logs: true
          }
        }
      }
    }),
    db.query.marketplaceIntegrations.findFirst({
      where: and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.type, 'hermes')
      )
    }),
    db.query.marketplaceIntegrations.findMany({
      where: and(
        eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
        eq(marketplaceIntegrations.isActive, true)
      )
    })
  ])

  const hermesConfig = hermesIntegration?.metadata as HermesConfig | null
  const defaultParcelClass = hermesConfig?.defaultParcelClass ?? 'XS'
  const customMiraklIntegrations = integrations.filter(i => i.type === 'mirakl_custom')
  
  const dhlIntegration = integrations.find(i => i.type === 'dhl')
  const dhlConfig = dhlIntegration?.metadata as DhlConfig | null

  const hasOttoIntegration = integrations.some(i => i.type === 'otto' && i.clientId)
  const hasDecathlonIntegration = integrations.some(i => i.type === 'mirakl_decathlon' && i.clientId)
  const hasAmazonIntegration = integrations.some(i => i.type === 'amazon' && i.refreshToken)
  const hasShopifyIntegration = integrations.some(i => i.type === 'shopify' && i.accessToken)
  const hasKauflandIntegration = integrations.some(i => i.type === 'kaufland' && i.clientId && i.clientSecret)
  const hasEbayIntegration = integrations.some(i => i.type === 'ebay' && i.clientId && i.clientSecret)
  const hasAboutYouIntegration = integrations.some(i => i.type === 'aboutyou' && i.apiKey)
 
  return (
    <div className="max-w-[1600px] mx-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Bestellungen</h2>
        <p className="text-gray-500 mt-2">Alle importierten Bestellungen im Überblick.</p>
      </header>

      <ManualImport 
        customMiraklIntegrations={customMiraklIntegrations} 
        hasKauflandIntegration={hasKauflandIntegration}
        hasEbayIntegration={hasEbayIntegration}
        hasOttoIntegration={hasOttoIntegration}
        hasDecathlonIntegration={hasDecathlonIntegration}
        hasShopifyIntegration={hasShopifyIntegration}
        hasAboutYouIntegration={hasAboutYouIntegration}
      />

      <OrdersTable 
        orders={allOrders} 
        hermesDefaultParcelClass={defaultParcelClass} 
        customMiraklIntegrations={customMiraklIntegrations}
        dhlConfig={dhlConfig}
        hasKauflandIntegration={hasKauflandIntegration}
        hasEbayIntegration={hasEbayIntegration}
        hasAboutYouIntegration={hasAboutYouIntegration}
        hasOttoIntegration={hasOttoIntegration}
        hasDecathlonIntegration={hasDecathlonIntegration}
        hasAmazonIntegration={hasAmazonIntegration}
        hasShopifyIntegration={hasShopifyIntegration}
      />
    </div>
  )
}

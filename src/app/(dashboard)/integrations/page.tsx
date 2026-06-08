import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'
import { OttoIntegrationForm } from './otto-form'
import { HermesIntegrationForm } from './hermes-form'
import { MiraklIntegrationForm } from './mirakl-form'
import { AmazonIntegrationForm } from './amazon-form'
import { DhlIntegrationForm } from './dhl-form'
import { ShopifyIntegrationForm } from './shopify-form'
import { AboutYouIntegrationForm } from './aboutyou-form'
import { KauflandIntegrationForm } from './kaufland-form'
import { EbayIntegrationForm } from './ebay-form'
import { WooCommerceIntegrationForm } from './woocommerce-form'
import { ShopwareIntegrationForm } from './shopware-form'
import { SyncSettingsForm } from './sync-settings-form'
import type { DhlConfig } from './dhl-form'
import { CollapsibleSection } from '@/components/collapsible-section'

export default async function IntegrationsPage(props: { 
  searchParams: Promise<{ [key: string]: string | string[] | undefined }> 
}) {
  const searchParams = await props.searchParams
  const status = searchParams?.status
  const auth = await requireAuth()

  const [
    [company],
    integrations
  ] = await Promise.all([
    db
      .select({
        fetchOrdersDaily: companies.fetchOrdersDaily,
        fetchOrdersTime: companies.fetchOrdersTime,
        fetchOrdersMarketplaces: companies.fetchOrdersMarketplaces,
      })
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1),
    db
      .select()
      .from(marketplaceIntegrations)
      .where(eq(marketplaceIntegrations.companyId, auth.activeCompanyId))
  ])

  const activeMarketplaces = integrations
    .filter((i) => i.isActive && i.type !== 'dhl' && i.type !== 'hermes')
    .map((i) => {
      let label: string = i.type
      if (i.type === 'otto') label = 'Otto.de'
      else if (i.type === 'amazon') label = 'Amazon EU'
      else if (i.type === 'shopify') label = 'Shopify'
      else if (i.type === 'aboutyou') label = 'About You'
      else if (i.type === 'kaufland') label = 'Kaufland'
      else if (i.type === 'ebay') label = 'eBay'
      else if (i.type === 'woocommerce') label = 'WooCommerce'
      else if (i.type === 'shopware') label = 'Shopware 6'
      else if (i.type === 'mirakl_decathlon') label = 'Decathlon DE (Mirakl)'
      else if (i.type === 'mirakl_custom') {
        label = (i.metadata as any)?.customName || 'Anderer Mirakl Marktplatz'
      }
      return {
        value: i.id,
        label,
      }
    })

  const activeMarketplacesList = integrations
    .filter((i) => i.isActive && i.type !== 'dhl' && i.type !== 'hermes')
    .map((i) => {
      const key = i.type === 'mirakl_custom'
        ? ((i.metadata as any)?.customName || '').toLowerCase()
        : i.type

      let label: string = i.type
      if (i.type === 'otto') label = 'Otto.de'
      else if (i.type === 'amazon') label = 'Amazon EU'
      else if (i.type === 'shopify') label = 'Shopify'
      else if (i.type === 'aboutyou') label = 'About You'
      else if (i.type === 'kaufland') label = 'Kaufland'
      else if (i.type === 'ebay') label = 'eBay'
      else if (i.type === 'woocommerce') label = 'WooCommerce'
      else if (i.type === 'shopware') label = 'Shopware 6'
      else if (i.type === 'mirakl_decathlon') label = 'Decathlon DE (Mirakl)'
      else if (i.type === 'mirakl_custom') {
        label = (i.metadata as any)?.customName || 'Anderer Mirakl Marktplatz'
      }

      return {
        key,
        label,
        type: i.type,
      }
    })

  const ottoIntegration = integrations.find((i: any) => i.type === 'otto')
  const customMiraklIntegrations = integrations.filter((i: any) => i.type === 'mirakl_custom')

  return (
    <div className="max-w-4xl">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Verbindungen & Integrationen</h2>
        <p className="text-gray-500 mt-2">Verbinde theomnistack mit deinen Verkaufskanälen und Versanddienstleistern, um Prozesse zu automatisieren.</p>
      </header>

      {status === 'hermes_success' && (
        <div className="mb-8 bg-green-50 border border-green-200 p-4 rounded-lg flex items-center text-green-700 animate-in fade-in slide-in-from-top-4 duration-500">
          <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="font-medium">Hermes wurde erfolgreich verbunden!</span>
        </div>
      )}

      {status === 'hermes_error' && (
        <div className="mb-8 bg-red-50 border border-red-200 p-4 rounded-lg flex items-center text-red-700 animate-in fade-in slide-in-from-top-4 duration-500">
          <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span className="font-medium">Fehler bei der Hermes-Anbindung. Bitte versuche es erneut.</span>
        </div>
      )}

      {status === 'otto_success' && (
        <div className="mb-8 bg-green-50 border border-green-200 p-4 rounded-lg flex items-center text-green-700 animate-in fade-in slide-in-from-top-4 duration-500">
          <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="font-medium">Otto.de Partner Connect wurde erfolgreich über OAuth2 verbunden!</span>
        </div>
      )}

      {status === 'otto_error' && (
        <div className="mb-8 bg-red-50 border border-red-200 p-4 rounded-lg flex items-center text-red-700 animate-in fade-in slide-in-from-top-4 duration-500">
          <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span className="font-medium">Fehler bei der Otto.de-Anbindung über OAuth2. Bitte versuche es erneut.</span>
        </div>
      )}

      <div className="space-y-12">
        {/* SECTION: AUTOMATION / SCHEDULE */}
        <CollapsibleSection
          title="Automatischer Bestellabruf"
          icon={<svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          defaultOpen={false}
          badge={company?.fetchOrdersDaily ? (
            <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              Aktiv
            </span>
          ) : (
            <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
              Inaktiv
            </span>
          )}
        >
          <div className="p-6 bg-gray-50">
            {company ? (
              <SyncSettingsForm company={company} activeMarketplaces={activeMarketplaces} />
            ) : (
              <p className="text-sm text-gray-500">Unternehmensdaten konnten nicht geladen werden.</p>
            )}
          </div>
        </CollapsibleSection>

        {/* SECTION: MARKETPLACES */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
            Marktplätze & Shopsysteme
          </h3>
          <div className="space-y-8">
            {/* Otto.de Card */}
            <CollapsibleSection
              title="Otto.de Partner Connect"
              subtitle="API Anbindung für Bestellimport & Rechnungs-Upload"
              icon={
                <div className="w-10 h-10 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-105">
                  <span className="text-red-600 font-black text-xs tracking-tighter">OTTO</span>
                </div>
              }
              badge={ottoIntegration?.clientId ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Verbunden
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                  Nicht verbunden
                </span>
              )}
            >
              <div className="p-6 bg-gray-50">
                <OttoIntegrationForm 
                  companyId={auth.activeCompanyId}
                  initialClientId={ottoIntegration?.clientId || ''} 
                  initialEnvironment={ottoIntegration?.environment || 'production'}
                  initialReturnAddressCarrierId={(ottoIntegration?.metadata as any)?.returnAddressCarrierId || ''}
                />
              </div>
            </CollapsibleSection>

            {/* Amazon Card */}
            <CollapsibleSection
              title="Amazon EU"
              subtitle="SP-API Anbindung für Bestellimport & Bestandsabgleich"
              icon={
                <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-105">
                  <span className="text-[#FF9900] font-black text-[10px] tracking-tighter">amazon</span>
                </div>
              }
              badge={integrations.find((i: any) => i.type === 'amazon')?.refreshToken ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Verbunden
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                  Nicht verbunden
                </span>
              )}
            >
              <div className="p-6 bg-gray-50">
                <AmazonIntegrationForm 
                  initialSellerId={integrations.find((i: any) => i.type === 'amazon')?.sellerId || ''}
                  initialClientId={integrations.find((i: any) => i.type === 'amazon')?.clientId || ''}
                  initialClientSecret={integrations.find((i: any) => i.type === 'amazon')?.clientSecret || ''}
                  initialRefreshToken={integrations.find((i: any) => i.type === 'amazon')?.refreshToken || ''}
                />
              </div>
            </CollapsibleSection>

            {/* Shopify Card */}
            <CollapsibleSection
              title="Shopify"
              subtitle="API Anbindung via Admin API für Bestellimport"
              icon={
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-105">
                  <span className="text-green-800 font-black text-xs tracking-tighter">Shopify</span>
                </div>
              }
              badge={integrations.find((i: any) => i.type === 'shopify')?.accessToken ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Verbunden
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                  Nicht verbunden
                </span>
              )}
            >
              <div className="p-6 bg-gray-50">
                <ShopifyIntegrationForm
                  initialData={integrations.find((i: any) => i.type === 'shopify')}
                />
              </div>
            </CollapsibleSection>

            {/* About You Card */}
            <CollapsibleSection
              title="About You"
              subtitle="API Anbindung für Bestellimport & Versandbestätigung"
              icon={
                <div className="w-10 h-10 bg-black rounded-lg flex flex-col items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-105">
                  <span className="text-white font-black text-[9px] uppercase tracking-tighter leading-none">About</span>
                  <span className="text-white font-black text-[9px] uppercase tracking-tighter leading-none mt-0.5">You</span>
                </div>
              }
              badge={integrations.find((i: any) => i.type === 'aboutyou')?.apiKey ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Verbunden
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                  Nicht verbunden
                </span>
              )}
            >
              <div className="p-6 bg-gray-50">
                <AboutYouIntegrationForm 
                  initialApiKey={integrations.find((i: any) => i.type === 'aboutyou')?.apiKey || ''}
                  initialEnvironment={integrations.find((i: any) => i.type === 'aboutyou')?.environment || 'production'}
                />
              </div>
            </CollapsibleSection>

            {/* Kaufland Card */}
            <CollapsibleSection
              title="Kaufland"
              subtitle="API Anbindung für Bestellimport & Bestandsabgleich"
              icon={
                <div className="w-10 h-10 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-105">
                  <span className="text-red-600 font-black text-[9px] tracking-tighter">Kaufland</span>
                </div>
              }
              badge={integrations.find((i: any) => i.type === 'kaufland')?.clientId ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Verbunden
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                  Nicht verbunden
                </span>
              )}
            >
              <div className="p-6 bg-gray-50">
                <KauflandIntegrationForm 
                  initialClientId={integrations.find((i: any) => i.type === 'kaufland')?.clientId || ''}
                  initialEnvironment={integrations.find((i: any) => i.type === 'kaufland')?.environment || 'production'}
                />
              </div>
            </CollapsibleSection>

            {/* eBay Card */}
            <CollapsibleSection
              title="eBay"
              subtitle="API Anbindung für Bestellimport & Bestandsabgleich"
              icon={
                <div className="w-10 h-10 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-105">
                  <span className="font-bold text-xs tracking-tight">
                    <span className="text-[#e53238]">e</span>
                    <span className="text-[#0064d2]">b</span>
                    <span className="text-[#f5af02]">a</span>
                    <span className="text-[#86b817]">y</span>
                  </span>
                </div>
              }
              badge={integrations.find((i: any) => i.type === 'ebay')?.clientId ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Verbunden
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                  Nicht verbunden
                </span>
              )}
            >
              <div className="p-6 bg-gray-50">
                <EbayIntegrationForm 
                  initialClientId={integrations.find((i: any) => i.type === 'ebay')?.clientId || ''}
                  initialEnvironment={integrations.find((i: any) => i.type === 'ebay')?.environment || 'production'}
                />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Decathlon DE (Mirakl)"
              subtitle="API Anbindung für Decathlon DE Bestellungen"
              icon={
                <div className="w-10 h-10 bg-sky-50 border border-sky-200 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-105">
                  <span className="text-[#0082C3] font-black text-[8px] tracking-tighter">DECATHLON</span>
                </div>
              }
              badge={integrations.find((i: any) => i.type === 'mirakl_decathlon')?.clientId ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Verbunden
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                  Nicht verbunden
                </span>
              )}
            >
              <div className="p-6 bg-gray-50">
                <MiraklIntegrationForm 
                  key={`mirakl_decathlon_${integrations.find((i: any) => i.type === 'mirakl_decathlon')?.updatedAt?.getTime() || 'new'}`}
                  type="mirakl_decathlon"
                  initialClientId={integrations.find((i: any) => i.type === 'mirakl_decathlon')?.clientId || ''}
                  initialClientSecret={integrations.find((i: any) => i.type === 'mirakl_decathlon')?.clientSecret || ''} 
                  initialEnvironment={integrations.find((i: any) => i.type === 'mirakl_decathlon')?.environment || ''}
                  initialApiKey={integrations.find((i: any) => i.type === 'mirakl_decathlon')?.apiKey || ''}
                  initialShopId={(integrations.find((i: any) => i.type === 'mirakl_decathlon')?.metadata as any)?.shopId || ''}
                />
              </div>
            </CollapsibleSection>

            {/* Existing Custom Mirakl Integrations */}
            {customMiraklIntegrations.map((integration: any) => (
              <CollapsibleSection 
                key={integration.id} 
                className="bg-white rounded-xl shadow-sm border border-blue-200 overflow-hidden"
                headerClassName="p-6 flex items-center justify-between cursor-pointer hover:bg-blue-50/20 bg-blue-50/50 transition-colors select-none"
                title={`${(integration.metadata as any)?.customName || 'Unbenannter Marktplatz'} (Mirakl)`}
                subtitle="Eigene API Anbindung"
                icon={
                  <div className="w-10 h-10 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-105">
                    <span className="text-indigo-700 font-black text-xs tracking-tighter">Mirakl</span>
                  </div>
                }
                badge={
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    Verbunden
                  </span>
                }
              >
                <div className="p-6 bg-gray-50">
                  <MiraklIntegrationForm 
                    id={integration.id}
                    type="mirakl_custom"
                    initialCustomName={(integration.metadata as any)?.customName || ''}
                    initialClientId={integration.clientId || ''}
                    initialClientSecret={integration.clientSecret || ''} 
                    initialEnvironment={integration.environment || ''}
                    initialApiKey={integration.apiKey || ''}
                    initialShopId={(integration.metadata as any)?.shopId || ''}
                  />
                </div>
              </CollapsibleSection>
            ))}

            {/* Add New Custom Mirakl Integration */}
            <CollapsibleSection
              className="bg-white rounded-xl shadow-sm border border-dashed border-gray-300 overflow-hidden hover:border-blue-400 transition-colors"
              title="Weiteren Mirakl Marktplatz hinzufügen"
              subtitle="Limango, Worten, B&Q und viele mehr anbinden"
              icon={
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xl">
                  +
                </div>
              }
            >
              <div className="p-6 bg-gray-50">
                <MiraklIntegrationForm 
                  type="mirakl_custom"
                  initialClientId=""
                  initialClientSecret="" 
                  initialEnvironment=""
                  initialApiKey=""
                />
              </div>
            </CollapsibleSection>

            {/* WooCommerce Card */}
            <CollapsibleSection
              title="WooCommerce"
              subtitle="REST API v3 Anbindung für Bestellimport & Versandbestätigung"
              icon={
                <div className="w-10 h-10 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-105">
                  <span className="text-[#96588a] font-black text-[8px] tracking-tighter">WooCommerce</span>
                </div>
              }
              badge={integrations.find((i: any) => i.type === 'woocommerce')?.clientId ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Verbunden
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                  Nicht verbunden
                </span>
              )}
            >
              <div className="p-6 bg-gray-50">
                <WooCommerceIntegrationForm
                  initialEnvironment={integrations.find((i: any) => i.type === 'woocommerce')?.environment || ''}
                  initialClientId={integrations.find((i: any) => i.type === 'woocommerce')?.clientId || ''}
                />
              </div>
            </CollapsibleSection>

            {/* Shopware 6 Card */}
            <CollapsibleSection
              title="Shopware 6"
              subtitle="Admin API Anbindung für Bestellimport & Versandbestätigung"
              icon={
                <div className="w-10 h-10 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-105">
                  <span className="text-[#189EFF] font-black text-[8px] tracking-tighter">Shopware</span>
                </div>
              }
              badge={integrations.find((i: any) => i.type === 'shopware')?.clientId ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Verbunden
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                  Nicht verbunden
                </span>
              )}
            >
              <div className="p-6 bg-gray-50">
                <ShopwareIntegrationForm
                  initialEnvironment={integrations.find((i: any) => i.type === 'shopware')?.environment || ''}
                  initialClientId={integrations.find((i: any) => i.type === 'shopware')?.clientId || ''}
                />
              </div>
            </CollapsibleSection>
          </div>
        </div>

        {/* SECTION: SHIPPING PROVIDERS */}
        <div className="pt-8 border-t border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
            Versanddienstleister
          </h3>
          <div className="space-y-8">
            {/* DHL Card */}
            <CollapsibleSection
              title="DHL Geschäftskunden"
              subtitle="Label-Erstellung & Versandzonen"
              icon={
                <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-105">
                  <span className="text-gray-900 font-black text-sm tracking-tighter">DHL</span>
                </div>
              }
              badge={(integrations.find((i: any) => i.type === 'dhl')?.metadata as any)?.username ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Konfiguriert
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                  Nicht konfiguriert
                </span>
              )}
            >
              <div className="p-6 bg-gray-50">
                <DhlIntegrationForm
                  initialConfig={(integrations.find((i: any) => i.type === 'dhl')?.metadata as DhlConfig) ?? undefined}
                  activeMarketplaces={activeMarketplacesList}
                />
              </div>
            </CollapsibleSection>

            {/* Hermes Card */}
            <CollapsibleSection
              title="Hermes Versand"
              subtitle="Offizielle Anbindung über die Hermes Login-Seite"
              icon={
                <div className="w-10 h-10 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-105">
                  <span className="text-[#005A9C] font-black text-xs tracking-tight">Hermes</span>
                </div>
              }
              badge={integrations.find((i: any) => i.type === 'hermes')?.clientId ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Aktiv
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                  Nicht konfiguriert
                </span>
              )}
            >
              <div className="p-6 bg-gray-50 flex justify-center">
                <HermesIntegrationForm 
                  initialClientId={integrations.find((i: any) => i.type === 'hermes')?.clientId || ''}
                  initialConfig={(integrations.find((i: any) => i.type === 'hermes')?.metadata as any) ?? undefined}
                  activeMarketplaces={activeMarketplacesList}
                />
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </div>
    </div>
  )
}

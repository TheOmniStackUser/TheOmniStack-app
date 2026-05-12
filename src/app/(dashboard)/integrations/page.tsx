import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq } from 'drizzle-orm'
import { OttoIntegrationForm } from './otto-form'
import { HermesIntegrationForm } from './hermes-form'
import { MiraklIntegrationForm } from './mirakl-form'
import { AmazonIntegrationForm } from './amazon-form'
import { DhlIntegrationForm } from './dhl-form'
import { ShopifyIntegrationForm } from './shopify-form'
import { AboutYouIntegrationForm } from './aboutyou-form'
import type { DhlConfig } from './dhl-form'

export default async function IntegrationsPage(props: { 
  searchParams: Promise<{ [key: string]: string | string[] | undefined }> 
}) {
  const searchParams = await props.searchParams
  const status = searchParams?.status
  const auth = await requireAuth()

  const integrations = await db
    .select()
    .from(marketplaceIntegrations)
    .where(eq(marketplaceIntegrations.companyId, auth.activeCompanyId))

  const ottoIntegration = integrations.find((i: any) => i.type === 'otto')

  return (
    <div className="max-w-4xl">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Marktplatz Integrationen</h2>
        <p className="text-gray-500 mt-2">Verbinde theomnistack mit deinen Verkaufskanälen, um Bestellungen automatisch zu importieren.</p>
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

      <div className="space-y-8">
        {/* Otto.de Card */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Otto.de Partner Connect</h3>
              <p className="text-sm text-gray-500">API Anbindung für Bestellimport & Rechnungs-Upload</p>
            </div>
            {ottoIntegration?.clientId ? (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Verbunden
              </span>
            ) : (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                Nicht verbunden
              </span>
            )}
          </div>
          <div className="p-6 bg-gray-50">
            <OttoIntegrationForm 
              initialClientId={ottoIntegration?.clientId || ''} 
              initialEnvironment={ottoIntegration?.environment || 'production'}
              initialReturnAddressCarrierId={(ottoIntegration?.metadata as any)?.returnAddressCarrierId || ''}
            />
          </div>
        </section>

        {/* Amazon Card */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Amazon EU</h3>
              <p className="text-sm text-gray-500">SP-API Anbindung für Bestellimport & Bestandsabgleich</p>
            </div>
            {integrations.find((i: any) => i.type === 'amazon')?.refreshToken ? (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Verbunden
              </span>
            ) : (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                Nicht verbunden
              </span>
            )}
          </div>
          <div className="p-6 bg-gray-50">
            <AmazonIntegrationForm 
              initialSellerId={integrations.find((i: any) => i.type === 'amazon')?.sellerId || ''}
              initialClientId={integrations.find((i: any) => i.type === 'amazon')?.clientId || ''}
              initialClientSecret={integrations.find((i: any) => i.type === 'amazon')?.clientSecret || ''}
              initialRefreshToken={integrations.find((i: any) => i.type === 'amazon')?.refreshToken || ''}
            />
          </div>
        </section>

        {/* Hermes Card */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Hermes Versand</h3>
              <p className="text-sm text-gray-500">Offizielle Anbindung über die Hermes Login-Seite</p>
            </div>
            {integrations.find((i: any) => i.type === 'hermes')?.accessToken ? (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Aktiv
              </span>
            ) : (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                Nicht konfiguriert
              </span>
            )}
          </div>
          <div className="p-8 bg-gray-50 flex flex-col items-center justify-center text-center">
            {integrations.find((i: any) => i.type === 'hermes')?.accessToken ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 max-w-md">
                  TheOmniStack ist erfolgreich mit deinem Hermes-Konto verknüpft. Du kannst jetzt Versandlabels direkt aus den Bestellungen erstellen.
                </p>
                <a 
                  href="/api/shipping/hermes/auth"
                  className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                >
                  Verbindung aktualisieren
                </a>
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-sm text-gray-600 max-w-md">
                  Klicke auf den Button unten, um dich sicher bei Hermes anzumelden und TheOmniStack den Zugriff für die Label-Erstellung zu erlauben.
                </p>
                <a 
                  href="/api/shipping/hermes/auth"
                  className="inline-flex items-center px-8 py-4 border border-transparent text-lg font-semibold rounded-xl shadow-lg text-white bg-blue-600 hover:bg-blue-700 transform transition hover:-translate-y-0.5 active:translate-y-0"
                >
                  <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Jetzt mit Hermes verbinden
                </a>
              </div>
            )}
          </div>
        </section>

        {/* DHL Card */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-gray-900 font-black text-sm tracking-tighter">DHL</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">DHL Versand</h3>
                <p className="text-sm text-gray-500">DHL Geschäftskundenportal – Label-Erstellung & Versandzonen</p>
              </div>
            </div>
            {(integrations.find((i: any) => i.type === 'dhl')?.metadata as any)?.username ? (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Konfiguriert
              </span>
            ) : (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                Nicht konfiguriert
              </span>
            )}
          </div>
          <div className="p-6 bg-gray-50">
            <DhlIntegrationForm
              initialConfig={(integrations.find((i: any) => i.type === 'dhl')?.metadata as DhlConfig) ?? undefined}
            />
          </div>
        </section>

        {/* Decathlon (Mirakl) Card */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Decathlon (Mirakl)</h3>
              <p className="text-sm text-gray-500">API Anbindung für Decathlon Bestellungen</p>
            </div>
            {integrations.find((i: any) => i.type === 'mirakl_decathlon')?.clientSecret ? (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Verbunden
              </span>
            ) : (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                Nicht verbunden
              </span>
            )}
          </div>
          <div className="p-6 bg-gray-50">
            <MiraklIntegrationForm 
              key={`mirakl_decathlon_${integrations.find((i: any) => i.type === 'mirakl_decathlon')?.updatedAt?.getTime() || 'new'}`}
              type="mirakl_decathlon"
              initialClientId={integrations.find((i: any) => i.type === 'mirakl_decathlon')?.clientId || ''}
              initialClientSecret={integrations.find((i: any) => i.type === 'mirakl_decathlon')?.clientSecret || ''} 
              initialEnvironment={integrations.find((i: any) => i.type === 'mirakl_decathlon')?.environment || ''}
              initialApiKey={integrations.find((i: any) => i.type === 'mirakl_decathlon')?.apiKey || ''}
            />
          </div>
        </section>

        {/* MIRAKL Hauptaccount Card */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">MIRAKL Hauptaccount</h3>
              <p className="text-sm text-gray-500">API Anbindung für Mirakl Hauptaccount (z.B. Decathlon EU)</p>
            </div>
            {integrations.find((i: any) => i.type === 'mirakl_decathlon_eu')?.clientSecret ? (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Verbunden
              </span>
            ) : (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                Nicht verbunden
              </span>
            )}
          </div>
          <div className="p-6 bg-gray-50">
            <MiraklIntegrationForm 
              key={`mirakl_decathlon_eu_${integrations.find((i: any) => i.type === 'mirakl_decathlon_eu')?.updatedAt?.getTime() || 'new'}`}
              type="mirakl_decathlon_eu"
              initialClientId={integrations.find((i: any) => i.type === 'mirakl_decathlon_eu')?.clientId || ''}
              initialClientSecret={integrations.find((i: any) => i.type === 'mirakl_decathlon_eu')?.clientSecret || ''} 
              initialEnvironment={integrations.find((i: any) => i.type === 'mirakl_decathlon_eu')?.environment || ''}
              initialApiKey={integrations.find((i: any) => i.type === 'mirakl_decathlon_eu')?.apiKey || ''}
            />
          </div>
        </section>

        {/* Shopify Card */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-green-800 font-black text-xs tracking-tighter">Shopify</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Shopify</h3>
                <p className="text-sm text-gray-500">API Anbindung via Admin API für Bestellimport</p>
              </div>
            </div>
            {integrations.find((i: any) => i.type === 'shopify')?.accessToken ? (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Verbunden
              </span>
            ) : (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                Nicht verbunden
              </span>
            )}
          </div>
          <div className="p-6 bg-gray-50">
            <ShopifyIntegrationForm
              initialData={integrations.find((i: any) => i.type === 'shopify')}
            />
          </div>
        </section>

        {/* About You Card */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">About You</h3>
              <p className="text-sm text-gray-500">API Anbindung für Bestellimport & Versandbestätigung</p>
            </div>
            {integrations.find((i: any) => i.type === 'aboutyou')?.apiKey ? (
              <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Verbunden
              </span>
            ) : (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full">
                Nicht verbunden
              </span>
            )}
          </div>
          <div className="p-6 bg-gray-50">
            <AboutYouIntegrationForm 
              initialApiKey={integrations.find((i: any) => i.type === 'aboutyou')?.apiKey || ''}
              initialEnvironment={integrations.find((i: any) => i.type === 'aboutyou')?.environment || 'production'}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

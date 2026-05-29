import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'
import { SettingsForm } from './settings-form'
import { DocumentNumbersForm } from './document-numbers-form'
import { DocumentTextSettings } from './document-text-settings'
import { VatSettings } from './vat-settings'
import { MarketplaceAutomation } from './marketplace-automation'
import { TwoFactorSettings } from './two-factor-settings'
import { ApiSettings } from './api-settings'
import { SmtpSettings } from './smtp-settings'
import { DunningSettings } from './dunning-settings'
import { vatSettings } from '@/db/schema/vat-settings'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { users } from '@/db/schema/auth'

export default async function SettingsPage(props: {
  searchParams: Promise<{ email_verified?: string }>
}) {
  const auth = await requireAuth()
  const resolvedSearchParams = await props.searchParams
  const emailVerified = resolvedSearchParams?.email_verified === 'true'

  const [
    [company],
    [user],
    initialVatSettings,
    integrations
  ] = await Promise.all([
    db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1),
    db
      .select({ twoFactorEnabled: users.twoFactorEnabled })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1),
    db
      .select()
      .from(vatSettings)
      .where(eq(vatSettings.companyId, auth.activeCompanyId)),
    db
      .select({
        id: marketplaceIntegrations.id,
        type: marketplaceIntegrations.type,
        autoInvoice: marketplaceIntegrations.autoInvoice,
        uploadInvoice: marketplaceIntegrations.uploadInvoice,
        metadata: marketplaceIntegrations.metadata
      })
      .from(marketplaceIntegrations)
      .where(eq(marketplaceIntegrations.companyId, auth.activeCompanyId))
  ])

  if (!company) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Unternehmensdaten konnten nicht geladen werden.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Unternehmenseinstellungen</h1>
        <p className="text-gray-500 mt-1">Verwalte deine Stammdaten, Rechnungs- und Lageradresse sowie Automatisierungen.</p>
      </div>

      {emailVerified && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-2xl flex items-start gap-3 text-green-800 shadow-sm">
          <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-bold text-sm">E-Mail-Adresse erfolgreich verifiziert!</p>
            <p className="text-xs text-green-700/90 mt-1">Deine neue Absenderadresse ist nun aktiv und wird für alle zukünftigen Dokumentenversendungen verwendet.</p>
          </div>
        </div>
      )}

      <SettingsForm company={company} />

      <DocumentNumbersForm company={company} />

      <DocumentTextSettings company={company} />

      <TwoFactorSettings initialEnabled={user?.twoFactorEnabled ?? false} />

      <MarketplaceAutomation integrations={integrations} />

      <ApiSettings />

      <SmtpSettings company={company} />

      <DunningSettings />

      <VatSettings initialSettings={initialVatSettings} />

    </div>
  )
}

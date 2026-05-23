import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { companies } from '@/db/schema/companies'
import { eq } from 'drizzle-orm'
import { SettingsForm } from './settings-form'
import { DocumentNumbersForm } from './document-numbers-form'
import { VatSettings } from './vat-settings'
import { MarketplaceAutomation } from './marketplace-automation'
import { TwoFactorSettings } from './two-factor-settings'
import { ApiSettings } from './api-settings'
import { vatSettings } from '@/db/schema/vat-settings'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { users } from '@/db/schema/auth'

export default async function SettingsPage() {
  const auth = await requireAuth()

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

      <SettingsForm company={company} />

      <DocumentNumbersForm company={company} />

      <TwoFactorSettings initialEnabled={user?.twoFactorEnabled ?? false} />

      <MarketplaceAutomation integrations={integrations} />

      <ApiSettings />

      <VatSettings initialSettings={initialVatSettings} />

      {/* Save Button for Main Profile Settings at the bottom */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-gray-900">Unternehmensdaten speichern</h4>
          <p className="text-sm text-gray-500">Klicke hier, um alle oben eingegebenen Stammdaten und Dokumenten-Einstellungen zu sichern.</p>
        </div>
        <button
          type="submit"
          form="settings-profile-form"
          className="px-8 py-3 rounded-2xl font-bold text-white shadow-lg bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/30 transition-all shrink-0 cursor-pointer"
        >
          Änderungen speichern
        </button>
      </div>
    </div>
  )
}

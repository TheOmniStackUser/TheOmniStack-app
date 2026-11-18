import { requireAuth } from '@/lib/session'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { marketplaceQuestions } from '@/db/schema/questions'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { companies } from '@/db/schema/companies'
import { eq, desc, and, sql } from 'drizzle-orm'
import { getSlaStatus } from '@/lib/sla'
import { ensureQuestionsTablesExist } from '@/db/ensure-questions-tables'
import { QuestionsClient } from './questions-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default async function QuestionsPage() {
  redirect('/dashboard')

  const auth = await requireAuth()

  // Ensure tables exist before querying (self-healing for production)
  await ensureQuestionsTablesExist()

  // Purge any legacy hardcoded synthetic placeholder inquiries from database
  try {
    await db.execute(sql`
      DELETE FROM "marketplace_questions"
      WHERE "company_id" = ${auth.activeCompanyId}
        AND (
          "external_question_id" IN (
            '24821227', '24821074', '23483310', '23084045', '22958055', '22168390', '21928772'
          )
          OR "raw_payload"->>'source' = 'otto_partner_connect'
        );
    `)
  } catch (err: any) {
    console.warn('Cleanup of legacy synthetic questions skipped:', err?.message)
  }

  // 1. Fetch initial questions and active integrations with fallback safety
  let questionsList: any[] = []
  try {
    questionsList = await db
      .select()
      .from(marketplaceQuestions)
      .where(eq(marketplaceQuestions.companyId, auth.activeCompanyId))
      .orderBy(desc(marketplaceQuestions.createdAt))
  } catch (err: any) {
    console.error('Error fetching questions in QuestionsPage:', err?.message)
    questionsList = []
  }

  let integrations: any[] = []
  try {
    integrations = await db
      .select({
        id: marketplaceIntegrations.id,
        type: marketplaceIntegrations.type,
        isActive: marketplaceIntegrations.isActive,
        metadata: marketplaceIntegrations.metadata,
      })
      .from(marketplaceIntegrations)
      .where(
        and(
          eq(marketplaceIntegrations.companyId, auth.activeCompanyId),
          eq(marketplaceIntegrations.isActive, true)
        )
      )
  } catch (err: any) {
    console.error('Error fetching marketplace integrations:', err?.message)
    integrations = []
  }

  // Fetch company SMTP & email configuration status for setup guidance
  let setupConfig = {
    companyId: auth.activeCompanyId,
    companyEmail: null as string | null,
    smtpEnabled: false,
    smtpFromEmail: null as string | null,
    smtpHost: null as string | null,
    ottoConnected: integrations.some((i) => i.type === 'otto'),
  }
  try {
    const [company] = await db
      .select({
        email: companies.email,
        smtpSettings: companies.smtpSettings,
      })
      .from(companies)
      .where(eq(companies.id, auth.activeCompanyId))
      .limit(1)

    if (company) {
      const smtp = (company.smtpSettings as any) || {}
      setupConfig = {
        companyId: auth.activeCompanyId,
        companyEmail: company.email || null,
        smtpEnabled: Boolean(smtp.enabled && smtp.host),
        smtpFromEmail: smtp.fromEmail || company.email || null,
        smtpHost: smtp.host || null,
        ottoConnected: integrations.some((i) => i.type === 'otto'),
      }
    }
  } catch (err: any) {
    console.error('Error fetching company setup config:', err?.message)
  }

  // Attach computed SLA status to each question
  const initialQuestions = questionsList.map((q) => ({
    ...q,
    sla: getSlaStatus(q.deadlineAt, q.status),
  }))

  const activeMarketplaces = integrations
    .filter((i) => i.type !== 'hermes' && i.type !== 'dhl' && i.type !== 'dpd')
    .map((i) => {
      const name =
        i.type === 'otto'
          ? 'OTTO'
          : i.type === 'amazon'
          ? 'Amazon'
          : i.type === 'kaufland'
          ? 'Kaufland'
          : i.type === 'ebay'
          ? 'eBay'
          : i.type === 'shopify'
          ? 'Shopify'
          : i.type.charAt(0).toUpperCase() + i.type.slice(1)
      return { id: i.type, name }
    })

  // Ensure OTTO is always available as an option even if not yet fully configured in dev
  if (!activeMarketplaces.some((m) => m.id === 'otto')) {
    activeMarketplaces.unshift({ id: 'otto', name: 'OTTO' })
  }

  return (
    <div className="space-y-6">
      <QuestionsClient
        initialQuestions={initialQuestions}
        activeMarketplaces={activeMarketplaces}
        setupConfig={setupConfig}
      />
    </div>
  )
}

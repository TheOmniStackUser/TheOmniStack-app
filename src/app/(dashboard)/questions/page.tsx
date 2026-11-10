import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { marketplaceQuestions } from '@/db/schema/questions'
import { marketplaceIntegrations } from '@/db/schema/integrations'
import { eq, desc, and } from 'drizzle-orm'
import { getSlaStatus } from '@/lib/sla'
import { ensureQuestionsTablesExist } from '@/db/ensure-questions-tables'
import { QuestionsClient } from './questions-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default async function QuestionsPage() {
  const auth = await requireAuth()

  // Ensure tables exist before querying (self-healing for production)
  await ensureQuestionsTablesExist()

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

  // Attach computed SLA status to each question
  const initialQuestions = questionsList.map((q) => ({
    ...q,
    sla: getSlaStatus(q.deadlineAt, q.status),
  }))

  const activeMarketplaces = integrations
    .filter((i) => i.type !== 'hermes' && i.type !== 'dhl')
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
      />
    </div>
  )
}

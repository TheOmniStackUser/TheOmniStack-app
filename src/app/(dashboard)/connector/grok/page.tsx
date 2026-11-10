import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { companies, companyMembers } from '@/db/schema/companies'
import { eq, and } from 'drizzle-orm'
import { headers } from 'next/headers'
import { TOOLS_MANIFEST } from '@/lib/grok-connector/tools'
import { GrokConsole } from './grok-console'

export const dynamic = 'force-dynamic'

export default async function GrokConnectorPage() {
  const auth = await requireAuth()

  // 1. Fetch personal API key first, then fallback to company key
  const [member] = await db
    .select({ apiKey: companyMembers.apiKey })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.companyId, auth.activeCompanyId),
        eq(companyMembers.userId, auth.userId)
      )
    )
    .limit(1)

  const [company] = await db
    .select({
      name: companies.name,
      apiKey: companies.apiKey,
    })
    .from(companies)
    .where(eq(companies.id, auth.activeCompanyId))
    .limit(1)

  const apiKey = member?.apiKey || company?.apiKey || null

  // 2. Resolve Base URL
  const hdrs = await headers()
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host') || 'localhost:3000'
  const proto = hdrs.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
  const baseUrl = `${proto}://${host}`

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-7xl mx-auto w-full">
      <GrokConsole
        initialApiKey={apiKey}
        baseUrl={baseUrl}
        companyName={company?.name || 'OmniStack'}
        toolsManifest={TOOLS_MANIFEST}
      />
    </div>
  )
}

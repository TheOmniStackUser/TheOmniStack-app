import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { returnsLog } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { ReturnsList } from './returns-list'

export const dynamic = 'force-dynamic'

export default async function ReturnsPage() {
  const auth = await requireAuth()

  // Auto-migration: Ensure columns exist in returns_log
  try {
    const { sql } = await import('drizzle-orm')
    await db.execute(sql`
      ALTER TABLE "returns_log" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'neu';
    `)
    await db.execute(sql`
      ALTER TABLE "returns_log" ADD COLUMN IF NOT EXISTS "marketplace" text;
    `)
    await db.execute(sql`
      ALTER TABLE "returns_log" ADD COLUMN IF NOT EXISTS "notes" text;
    `)
    await db.execute(sql`
      ALTER TABLE "returns_log" ADD COLUMN IF NOT EXISTS "received_at" timestamp default now() NOT NULL;
    `)
  } catch (err) {
    console.error('[Returns] Auto-migrations failed:', err)
  }

  // Strict Access Control: Only Owner and Support / Beta support can see returns for now
  if (auth.role !== 'owner' && auth.role !== 'omnistack_support' && auth.role !== 'omnistack_beta') {
    redirect('/dashboard')
  }

  // Fetch returns log with items
  const logs = await db.query.returnsLog.findMany({
    where: eq(returnsLog.companyId, auth.activeCompanyId),
    orderBy: [desc(returnsLog.scannedAt)],
    with: {
      items: true,
      order: {
        columns: {
          status: true,
          totalAmount: true,
          currency: true
        }
      }
    }
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Retouren-Eingang</h1>
        <p className="text-slate-500 mt-2">Übersicht aller über die mobile App erfassten Warenrücksendungen.</p>
      </div>

      <ReturnsList initialLogs={logs} />
    </div>
  )
}

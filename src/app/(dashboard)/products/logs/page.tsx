import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { productSyncLogs } from '@/db/schema/products'
import { eq, desc } from 'drizzle-orm'
import { LogsClient } from './logs-client'
import { History } from 'lucide-react'
import { ProductsSubNav } from '../products-subnav'

export const metadata = {
  title: 'Sync Logs - TheOmniStack',
}

export default async function SyncLogsPage() {
  const auth = await requireAuth()

  const logs = await db
    .select()
    .from(productSyncLogs)
    .where(eq(productSyncLogs.companyId, auth.activeCompanyId))
    .orderBy(desc(productSyncLogs.startedAt))
    .limit(100) // Limit to latest 100 for now to prevent massive payloads

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col gap-5 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-cyan-50 text-cyan-600 rounded-xl">
              <History className="w-6 h-6" />
            </div>
            Sync Logs
          </h1>
          <p className="text-slate-500 font-medium mt-1.5 text-sm">
            Verfolgen Sie detailliert, wann welche Produkte an Marktplätze gesendet wurden.
          </p>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <ProductsSubNav />
        </div>
      </header>

      <LogsClient initialLogs={logs} />
    </div>
  )
}

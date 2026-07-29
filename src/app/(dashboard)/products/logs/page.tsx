import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { productSyncLogs } from '@/db/schema/products'
import { eq, desc } from 'drizzle-orm'
import { LogsClient } from './logs-client'
import { ArrowLeft, History } from 'lucide-react'
import Link from 'next/link'

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
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link 
              href="/products" 
              className="text-slate-400 hover:text-cyan-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
              <div className="p-2.5 bg-cyan-50 text-cyan-600 rounded-xl">
                <History className="w-6 h-6" />
              </div>
              Sync Logs
            </h1>
          </div>
          <p className="text-slate-500 font-medium ml-12">
            Verfolgen Sie detailliert, wann welche Produkte an Marktplätze gesendet wurden.
          </p>
        </div>
      </header>

      <LogsClient initialLogs={logs} />
    </div>
  )
}

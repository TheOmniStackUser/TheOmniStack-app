import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { returnsLog } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ReturnsPage() {
  const auth = await requireAuth()

  // Strict Access Control: Only Owner and Support can see returns for now
  if (auth.role !== 'owner' && auth.role !== 'omnistack_support') {
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

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Scan-Zeitpunkt</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Bestellnummer</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Kunde</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Artikel</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Zustand</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Matching</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                  Noch keine Retouren erfasst.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {format(new Date(log.scannedAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-900">
                    {log.orderNumber}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-900">{log.customerName}</div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{log.shippingAddress}</div>
                  </td>
                  <td className="px-6 py-4">
                    {log.items.map((item, idx) => (
                      <div key={idx} className="text-sm text-slate-700">
                        {item.quantity}x {item.skuOrProductName}
                      </div>
                    ))}
                  </td>
                  <td className="px-6 py-4">
                    {log.items.map((item, idx) => (
                      <div key={idx} className={`text-xs font-bold uppercase ${
                        item.condition === 'new' ? 'text-green-600' : 'text-amber-600'
                      }`}>
                        {item.condition === 'new' ? 'Neu' : item.condition === 'damaged' ? 'Defekt' : item.condition}
                      </div>
                    ))}
                  </td>
                  <td className="px-6 py-4">
                    {log.orderId ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                        Zugeordnet
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 text-slate-500 border border-slate-200">
                        Nicht gefunden
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

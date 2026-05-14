import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { orders } from '@/db/schema/orders'
import { eq, desc, and, ne } from 'drizzle-orm'
import { OrdersTable } from './orders-table'
import { ManualImport } from './manual-import'

export default async function OrdersPage() {
  const auth = await requireAuth()

  const allOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.companyId, auth.activeCompanyId),
      eq(orders.isArchived, false),
      ne(orders.status, 'draft')
    ),
    orderBy: [desc(orders.marketplacePurchaseDate)],
    with: {
      items: true,
      invoice: true
    }
  })

  return (
    <div className="max-w-[1600px] mx-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Bestellungen</h2>
        <p className="text-gray-500 mt-2">Alle importierten Bestellungen im Überblick.</p>
      </header>

      <ManualImport />

      <OrdersTable orders={allOrders} />
    </div>
  )
}

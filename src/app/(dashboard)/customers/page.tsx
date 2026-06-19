import { requireAuth } from '@/lib/session'
import { db } from '@/db/client'
import { customers } from '@/db/schema/customers'
import { eq, desc } from 'drizzle-orm'
import { CustomersClient } from './customers-client'

export default async function CustomersPage() {
  const auth = await requireAuth()

  // Fetch initial customers
  const initialCustomers = await db
    .select()
    .from(customers)
    .where(eq(customers.companyId, auth.activeCompanyId))
    .orderBy(desc(customers.createdAt))
    .limit(50)

  return (
    <div className="max-w-[1600px] mx-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Kunden</h2>
        <p className="text-gray-500 mt-2">Verwalten Sie Ihre Kundendaten zentral.</p>
      </header>

      <CustomersClient initialCustomers={initialCustomers} />
    </div>
  )
}

import { requireAuth } from '@/lib/session'
import { getCustomerByIdAction, getCustomerDocumentsAction, getCustomerStatsAction } from '@/app/actions/customers'
import { CustomerDetailClient } from './customer-detail-client'
import { redirect } from 'next/navigation'

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  await requireAuth()

  const customerId = params.id

  const customer = await getCustomerByIdAction(customerId)
  if (!customer) {
    redirect('/customers')
  }

  const documents = await getCustomerDocumentsAction(customerId)
  const stats = await getCustomerStatsAction(customerId)

  return (
    <div className="max-w-7xl mx-auto">
      <CustomerDetailClient 
        customer={customer} 
        documents={documents} 
        stats={stats} 
      />
    </div>
  )
}

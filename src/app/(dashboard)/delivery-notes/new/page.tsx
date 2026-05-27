import { Suspense } from 'react'
import { requireAuth } from '@/lib/session'
import { NewInvoiceForm } from '@/app/(dashboard)/invoices/new/new-invoice-form'

export default async function NewDeliveryNotePage() {
  await requireAuth()

  return (
    <div className="py-8 px-4 md:px-0">
      <Suspense fallback={<div className="text-center p-12 text-slate-400">Lädt Formular...</div>}>
        <NewInvoiceForm documentType="delivery_note" />
      </Suspense>
    </div>
  )
}

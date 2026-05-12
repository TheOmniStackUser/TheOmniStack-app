import { Suspense } from 'react'
import { requireAuth } from '@/lib/session'
import { NewInvoiceForm } from './new-invoice-form'

export default async function NewInvoicePage() {
  await requireAuth()

  return (
    <div className="py-8 px-4 md:px-0">
      <div className="max-w-4xl mx-auto mb-10">
        <h1 className="text-3xl font-bold text-slate-900">Neue Rechnung schreiben</h1>
        <p className="text-slate-500 mt-2">
          Erstelle eine manuelle Rechnung. Diese wird automatisch als Bestellung im System erfasst 
          und für die Buchhaltung sowie das Rechnungsausgangsbuch berücksichtigt.
        </p>
      </div>

      <Suspense fallback={<div className="text-center p-12 text-slate-400">Lädt Formular...</div>}>
        <NewInvoiceForm />
      </Suspense>
    </div>
  )
}

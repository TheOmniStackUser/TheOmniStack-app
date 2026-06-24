import { Suspense } from 'react'
import { requireAuth } from '@/lib/session'
import { NewInvoiceForm } from '@/app/(dashboard)/invoices/new/new-invoice-form'

export default async function NewQuotePage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  await requireAuth()
  
  const isEditing = !!searchParams.edit

  return (
    <div className="py-8 px-4 md:px-0">
      <div className="max-w-4xl mx-auto mb-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            {isEditing ? 'Angebot bearbeiten' : 'Neues Angebot erstellen'}
          </h1>
        </div>
        <p className="text-slate-500">
          {isEditing 
            ? 'Bearbeite ein bestehendes Angebot.' 
            : 'Erstelle ein Angebot. Es kann anschließend per Klick beliebig oft in eine Rechnung oder einen Lieferschein umgewandelt werden.'}
        </p>
      </div>

      <Suspense fallback={<div className="text-center p-12 text-slate-400">Lädt Formular...</div>}>
        <NewInvoiceForm documentType="quote" />
      </Suspense>
    </div>
  )
}

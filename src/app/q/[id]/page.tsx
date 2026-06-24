import { getPublicQuoteAction } from '@/app/actions/quotes-public'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { QuoteActions } from './quote-actions'
import { CheckCircle2, XCircle, FileText } from 'lucide-react'

export const metadata = {
  title: 'Angebot prüfen',
}

export default async function PublicQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const { id } = resolvedParams
  const data = await getPublicQuoteAction(id).catch(() => null)

  if (!data) {
    notFound()
  }

  const { quote, pdfUrl } = data
  const company = quote.company

  const isAccepted = !!quote.quoteAcceptedAt
  const isRejected = !!quote.quoteRejectedAt
  const isAnswered = isAccepted || isRejected

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-amber-100 selection:text-amber-900 flex flex-col">
      {/* Top Banner / Header */}
      <header className="bg-white border-b border-slate-200 py-6 px-4 md:px-8 shrink-0">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {company.logoUrl ? (
              <img src={company.logoUrl} alt={company.name || ''} className="h-10 object-contain" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-400">
                {(company.name || 'C')[0]}
              </div>
            )}
            <div>
              <h1 className="font-black text-lg text-slate-900 leading-tight tracking-tight">
                {company.legalName || company.name}
              </h1>
              <p className="text-sm text-slate-500 font-medium">Angebot {quote.invoiceNumber}</p>
            </div>
          </div>
          <div className="text-right text-sm text-slate-500 hidden md:block">
            {company.email && <p>{company.email}</p>}
            {company.phone && <p>{company.phone}</p>}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 flex flex-col gap-8">
        
        {/* Status Banner */}
        {isAnswered && (
          <div className={`p-6 rounded-2xl flex items-start gap-4 border ${isAccepted ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
            {isAccepted ? <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" /> : <XCircle className="w-8 h-8 text-rose-500 shrink-0" />}
            <div>
              <h2 className="font-black text-lg">
                {isAccepted ? 'Angebot erfolgreich angenommen' : 'Angebot abgelehnt'}
              </h2>
              <p className={`text-sm mt-1 font-medium ${isAccepted ? 'text-emerald-700' : 'text-rose-700'}`}>
                {isAccepted 
                  ? `Sie haben das Angebot am ${format(new Date(quote.quoteAcceptedAt!), 'dd.MM.yyyy', { locale: de })} verbindlich angenommen. Vielen Dank für das Vertrauen!`
                  : `Sie haben das Angebot am ${format(new Date(quote.quoteRejectedAt!), 'dd.MM.yyyy', { locale: de })} abgelehnt.`}
              </p>
            </div>
          </div>
        )}

        {/* Quote Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="p-8 md:p-12 border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white">
            <div className="flex flex-col md:flex-row justify-between gap-8 mb-12">
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-amber-500 mb-2 block">An</span>
                <p className="font-bold text-slate-900 text-lg mb-1">{quote.recipientName}</p>
                {quote.recipientCompany && <p className="text-slate-600">{quote.recipientCompany}</p>}
                <p className="text-slate-600">{quote.recipientStreet}</p>
                <p className="text-slate-600">{quote.recipientZip} {quote.recipientCity}</p>
                <p className="text-slate-600">{quote.recipientCountry}</p>
              </div>
              <div className="text-left md:text-right">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">Angebotsdetails</span>
                <p className="text-slate-600"><span className="font-medium mr-2">Nummer:</span> {quote.invoiceNumber}</p>
                <p className="text-slate-600"><span className="font-medium mr-2">Datum:</span> {format(new Date(quote.createdAt), 'dd.MM.yyyy', { locale: de })}</p>
                {quote.dueAt && (
                  <p className="text-slate-600"><span className="font-medium mr-2">Gültig bis:</span> {format(new Date(quote.dueAt), 'dd.MM.yyyy', { locale: de })}</p>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-100">
                    <th className="py-3 font-black text-xs uppercase tracking-wider text-slate-400">Pos</th>
                    <th className="py-3 font-black text-xs uppercase tracking-wider text-slate-400">Beschreibung</th>
                    <th className="py-3 font-black text-xs uppercase tracking-wider text-slate-400 text-right">Menge</th>
                    <th className="py-3 font-black text-xs uppercase tracking-wider text-slate-400 text-right hidden sm:table-cell">Einzelpreis</th>
                    <th className="py-3 font-black text-xs uppercase tracking-wider text-slate-400 text-right">Gesamt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {quote.items.map((item) => (
                    <tr key={item.id} className="text-sm">
                      <td className="py-4 pr-4 text-slate-500 font-medium">{item.position}</td>
                      <td className="py-4 pr-4 font-medium text-slate-900">
                        {item.description}
                        {item.sku && <span className="block text-xs text-slate-400 font-normal mt-0.5">Art.-Nr.: {item.sku}</span>}
                      </td>
                      <td className="py-4 pr-4 text-right font-medium text-slate-700">{parseFloat(item.quantity).toString()}</td>
                      <td className="py-4 pr-4 text-right text-slate-500 hidden sm:table-cell">
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: quote.currency }).format(parseFloat(item.unitPrice))}
                      </td>
                      <td className="py-4 text-right font-bold text-slate-900">
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: quote.currency }).format(parseFloat(item.lineTotal))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 flex flex-col items-end gap-2 border-t border-slate-100 pt-8">
              <div className="flex justify-between w-full sm:w-64 text-sm text-slate-500">
                <span>Zwischensumme Netto</span>
                <span>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: quote.currency }).format(parseFloat(quote.subtotalAmount))}</span>
              </div>
              <div className="flex justify-between w-full sm:w-64 text-sm text-slate-500">
                <span>MwSt. ({(parseFloat(quote.taxRate) * 100).toFixed(0)}%)</span>
                <span>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: quote.currency }).format(parseFloat(quote.taxAmount))}</span>
              </div>
              <div className="flex justify-between w-full sm:w-64 text-xl font-black text-slate-900 mt-2 pt-2 border-t-2 border-slate-100">
                <span>Gesamtbetrag</span>
                <span className="text-amber-600">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: quote.currency }).format(parseFloat(quote.totalAmount))}</span>
              </div>
            </div>
          </div>

          {/* Action Area */}
          {!isAnswered && (
            <div className="bg-slate-50 p-8 md:p-12 border-t border-slate-200 text-center">
              <h3 className="text-xl font-black text-slate-900 mb-2">Wie möchten Sie verfahren?</h3>
              <p className="text-slate-500 mb-8 max-w-lg mx-auto">
                Bitte prüfen Sie das Angebot sorgfältig. Mit einem Klick auf "Verbindlich annehmen" nehmen Sie das Angebot zu den genannten Konditionen an.
              </p>
              
              <div className="max-w-lg mx-auto">
                <QuoteActions quoteId={quote.id} pdfUrl={pdfUrl} />
              </div>
            </div>
          )}

          {isAnswered && pdfUrl && (
            <div className="bg-slate-50 p-6 border-t border-slate-200 text-center">
               <a 
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 text-amber-600 hover:text-amber-700 font-bold p-2"
              >
                <FileText size={18} />
                Angebot als PDF herunterladen
              </a>
            </div>
          )}
        </div>

        <footer className="text-center text-slate-400 text-xs py-8">
          <p>© {new Date().getFullYear()} {company.legalName || company.name}. Alle Rechte vorbehalten.</p>
        </footer>
      </main>
    </div>
  )
}

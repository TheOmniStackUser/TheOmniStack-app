'use client'

import React, { useState } from 'react'
import Link from 'next/link'

export function CustomerDetailClient({ 
  customer, 
  documents, 
  stats 
}: { 
  customer: any, 
  documents: any[], 
  stats: any 
}) {
  const [activeTab, setActiveTab] = useState<'all' | 'quote' | 'invoice' | 'delivery_note'>('all')
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  const filteredDocs = documents.filter(doc => {
    if (activeTab === 'all') return true
    if (activeTab === 'invoice') return doc.documentType === 'invoice' || doc.isCreditNote
    return doc.documentType === activeTab
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/customers" className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Kundendetails</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm md:col-span-2">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-bold text-slate-900">{customer.companyName || customer.name}</h2>
                {customer.customerNumber && (
                  <span className="font-mono text-xs font-bold text-cyan-700 bg-cyan-50 border border-cyan-200 px-2 py-1 rounded-md uppercase">
                    {customer.customerNumber}
                  </span>
                )}
              </div>
              {customer.companyName && <p className="text-sm font-medium text-slate-600 mb-4">{customer.name}</p>}
              
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 mt-6">
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Kontakt</div>
                  <div className="text-sm text-slate-700">{customer.email || '---'}</div>
                  <div className="text-sm text-slate-700">{customer.phone || '---'}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Adresse</div>
                  <div className="text-sm text-slate-700">{customer.street || '---'}</div>
                  <div className="text-sm text-slate-700">{customer.zip} {customer.city}</div>
                  <div className="text-sm text-slate-700">{customer.country}</div>
                </div>
                {customer.vatId && (
                  <div className="col-span-2">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">USt-IdNr.</div>
                    <div className="text-sm text-slate-700">{customer.vatId}</div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              <Link href={`/quotes/new?customerId=${customer.id}`} className="px-4 py-2 bg-amber-50 text-amber-700 font-bold text-sm rounded-xl hover:bg-amber-100 transition-colors flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                Neues Angebot
              </Link>
              <Link href={`/invoices/new?customerId=${customer.id}`} className="px-4 py-2 bg-blue-50 text-blue-700 font-bold text-sm rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                Neue Rechnung
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl shadow-xl flex flex-col justify-center">
          <div className="space-y-6">
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Gesamtumsatz</div>
              <div className="text-3xl font-bold text-white">
                {stats.totalRevenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Offene Posten</div>
              <div className="text-xl font-bold text-rose-400">
                {stats.outstandingBalance.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </div>
            </div>
            <div className="pt-4 border-t border-slate-800">
              <div className="text-sm font-medium text-slate-400">
                Gesamt {stats.totalDocuments} Dokumente
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="flex gap-2">
            <button onClick={() => setActiveTab('all')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === 'all' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Alle</button>
            <button onClick={() => setActiveTab('quote')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === 'quote' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Angebote</button>
            <button onClick={() => setActiveTab('invoice')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === 'invoice' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Rechnungen & Gutschriften</button>
            <button onClick={() => setActiveTab('delivery_note')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${activeTab === 'delivery_note' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Lieferscheine</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider">Datum</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider">Dokument</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider">Status</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider text-right">Betrag</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase text-[10px] tracking-wider text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocs.map((doc) => {
                const isQuote = doc.documentType === 'quote'
                const isDelivery = doc.documentType === 'delivery_note'
                const isCreditNote = doc.isCreditNote
                const isInvoice = !isQuote && !isDelivery && !isCreditNote
                
                let linkPath = ''
                if (isQuote) linkPath = `/quotes/new?edit=${doc.id}`
                else if (isDelivery) linkPath = `/delivery-notes/new?edit=${doc.id}`
                else linkPath = `/invoices/new?edit=${doc.id}`
                
                return (
                  <React.Fragment key={doc.id}>
                    <tr 
                      onClick={() => setExpandedRowId(expandedRowId === doc.id ? null : doc.id)}
                      className={`hover:bg-slate-50 transition-colors group cursor-pointer ${expandedRowId === doc.id ? 'bg-slate-50' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div className="text-slate-900 font-medium">{new Date(doc.createdAt).toLocaleDateString('de-DE')}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isQuote ? 'bg-amber-100 text-amber-700' : isDelivery ? 'bg-purple-100 text-purple-700' : isCreditNote ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>
                            {isQuote && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                            {isDelivery && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
                            {isCreditNote && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                            {isInvoice && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{doc.invoiceNumber || doc.draftName || 'Unbenannt'}</div>
                            <div className="text-xs text-slate-500 font-medium">{isQuote ? 'Angebot' : isDelivery ? 'Lieferschein' : isCreditNote ? 'Gutschrift' : 'Rechnung'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {doc.status === 'draft' && <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-600">Entwurf</span>}
                        {doc.status === 'issued' && doc.paidAt && <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">Bezahlt</span>}
                        {doc.status === 'issued' && !doc.paidAt && <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-600 border border-amber-200">Offen</span>}
                        {doc.status === 'cancelled' && <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200">Storniert</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className={`font-bold ${isCreditNote ? 'text-rose-600' : 'text-slate-900'}`}>
                          {isCreditNote ? '-' : ''}{parseFloat(doc.totalAmount || '0').toLocaleString('de-DE', { style: 'currency', currency: doc.currency || 'EUR' })}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link 
                          href={linkPath}
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors border border-transparent hover:border-cyan-100 inline-flex items-center gap-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          Öffnen
                        </Link>
                      </td>
                    </tr>
                    {expandedRowId === doc.id && (
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-white rounded-xl border border-slate-100 shadow-sm animate-in fade-in slide-in-from-top-2">
                            <div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Rechnungsadresse</div>
                              <div className="text-sm font-semibold text-slate-900">{doc.recipientName || '---'}</div>
                              <div className="text-sm text-slate-600">{doc.recipientStreet || '---'}</div>
                              <div className="text-sm text-slate-600">{(doc.recipientZip || '') + ' ' + (doc.recipientCity || '')}</div>
                              <div className="text-sm text-slate-600">{doc.recipientCountry || '---'}</div>
                              <div className="text-sm text-slate-500 mt-1">{doc.recipientEmail || '---'}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Dokumenten-Infos</div>
                              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                <span className="text-xs text-slate-500">Erstellt am</span>
                                <span className="text-xs font-medium text-slate-900">{new Date(doc.createdAt).toLocaleDateString('de-DE')}</span>
                              </div>
                              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                <span className="text-xs text-slate-500">Status</span>
                                <span className="text-xs font-medium text-slate-900">{doc.status === 'draft' ? 'Entwurf' : doc.status === 'issued' ? 'Ausgestellt' : 'Storniert'}</span>
                              </div>
                              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                <span className="text-xs text-slate-500">Bezahlt am</span>
                                <span className="text-xs font-medium text-slate-900">{doc.paidAt ? new Date(doc.paidAt).toLocaleDateString('de-DE') : '---'}</span>
                              </div>
                              <div className="flex justify-between items-center py-1">
                                <span className="text-xs text-slate-500">Dokument-Typ</span>
                                <span className="text-xs font-medium text-slate-900">{isQuote ? 'Angebot' : isDelivery ? 'Lieferschein' : isCreditNote ? 'Gutschrift' : 'Rechnung'}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
              {filteredDocs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium">
                    Keine Dokumente gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

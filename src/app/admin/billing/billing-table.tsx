'use client'

import { useState } from 'react'
import { MerchantBillingModal, type BillingCompanyData } from './merchant-billing-modal'

interface BillingTableProps {
  rows: BillingCompanyData[]
  minPrice: number
}

export function BillingTable({ rows: initialRows, minPrice }: BillingTableProps) {
  const [rows, setRows] = useState<BillingCompanyData[]>(initialRows)
  const [selectedCompany, setSelectedCompany] = useState<BillingCompanyData | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleOpenModal = (company: BillingCompanyData) => {
    setSelectedCompany(company)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  const handleCompanyUpdated = (updated: BillingCompanyData) => {
    setRows(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r))
    setSelectedCompany(updated)
  }

  return (
    <>
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[1000px]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Händler</th>
              <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Abrechnungszeitraum</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Bestellungen</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Preis/Stufe</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Betrag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map(row => {
              const startDate = row.period?.start ? new Date(row.period.start) : null
              const endDate = row.period?.end ? new Date(row.period.end) : null
              const anniversaryDay = row.createdAt ? new Date(row.createdAt).getDate() : (startDate ? startDate.getDate() : 1)
              const isBelowMin = (row.orderCount ?? 0) * (row.tier?.pricePerOrder ?? 0) < minPrice

              return (
                <tr key={row.id} className="hover:bg-white/[0.07] transition-colors">
                  {/* Clickable Merchant Column */}
                  <td
                    className="px-6 py-4 cursor-pointer group select-none"
                    onClick={() => handleOpenModal(row)}
                    title="Klicken, um Rechnungsadresse und Stammdaten anzuzeigen"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-white group-hover:text-violet-300 transition-colors">
                            {row.name}
                          </p>
                          <span className="text-[10px] font-semibold text-violet-300/90 bg-violet-500/15 border border-violet-500/25 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1">
                            <svg className="w-2.5 h-2.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            </svg>
                            Adresse
                          </span>
                        </div>
                        <p className="text-xs text-white/30 group-hover:text-white/50 transition-colors mt-0.5">
                          {row.email || '–'}
                        </p>
                      </div>

                      <span className="text-white/20 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all p-1.5 rounded-lg group-hover:bg-violet-500/10">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </div>
                  </td>

                  {/* Abrechnungszeitraum */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-1.5 py-0.5 bg-violet-500/20 text-violet-400 text-[10px] font-bold rounded uppercase border border-violet-500/20">
                        Jeden {anniversaryDay}.
                      </span>
                      <p className="text-white font-medium">
                        {startDate?.toLocaleDateString('de-DE') || '–'} – {endDate?.toLocaleDateString('de-DE') || '–'}
                      </p>
                    </div>
                    <p className="text-[10px] text-white/30 uppercase">Zyklus: Monatlich ab Anmeldung</p>
                  </td>

                  {/* Bestellungen */}
                  <td className="px-6 py-4 text-right font-semibold text-white">
                    {row.orderCount ?? 0}
                  </td>

                  {/* Preis/Stufe */}
                  <td className="px-6 py-4 text-right">
                    <p className="text-white font-mono">
                      {(row.tier?.pricePerOrder ?? 0).toFixed(4)} €
                    </p>
                    <p className="text-[10px] text-white/30">
                      Stufe: {row.tier?.upTo === Infinity ? '∞' : row.tier?.upTo}
                    </p>
                  </td>

                  {/* Betrag */}
                  <td className="px-6 py-4 text-right font-bold text-white">
                    <div className="flex flex-col items-end">
                      <span>
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(row.total ?? 0)}
                      </span>
                      {isBelowMin && (
                        <span className="text-[10px] text-amber-400 font-bold uppercase tracking-tighter">
                          Mindestpreis
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <MerchantBillingModal
        company={selectedCompany}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onCompanyUpdated={handleCompanyUpdated}
      />
    </>
  )
}

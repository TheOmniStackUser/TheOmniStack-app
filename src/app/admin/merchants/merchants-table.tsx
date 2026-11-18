'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MerchantDetailsModal, type MerchantCompanyData } from '@/app/admin/components/merchant-details-modal'

export interface EnrichedCompanyRow extends MerchantCompanyData {
  thisMonth: number
  lastMonth: number
  total: number
  userCount: number
  trend: number | null
  latestLogin?: { time: string; app: string | null } | null
}

interface MerchantsTableProps {
  companies: EnrichedCompanyRow[]
  sort: string
  order: string
  monthName: string
  lastMonthName: string
}

export function MerchantsTable({
  companies: initialCompanies,
  sort,
  order,
  monthName,
  lastMonthName,
}: MerchantsTableProps) {
  const [companies, setCompanies] = useState<EnrichedCompanyRow[]>(initialCompanies)
  const [selectedCompany, setSelectedCompany] = useState<MerchantCompanyData | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleOpenModal = (company: EnrichedCompanyRow) => {
    setSelectedCompany(company)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  const handleCompanyUpdated = (updated: MerchantCompanyData) => {
    setCompanies(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
    setSelectedCompany(updated)
  }

  const toggleOrder = (col: string) => {
    if (sort === col) {
      return order === 'asc' ? 'desc' : 'asc'
    }
    if (['users', 'lastMonth', 'thisMonth', 'total', 'login', 'trial'].includes(col)) {
      return 'desc'
    }
    return 'asc'
  }

  const SortHeader = ({ col, label, align = 'left' }: { col: string; label: string; align?: 'left' | 'right' | 'center' }) => {
    const isActive = sort === col
    const nextOrder = toggleOrder(col)

    return (
      <th className={`px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider text-${align}`}>
        <Link
          href={`?sort=${col}&order=${nextOrder}`}
          className={`group inline-flex items-center gap-1 hover:text-white transition-colors ${align === 'right' ? 'flex-row-reverse' : ''}`}
        >
          {label}
          <span className={`text-[10px] w-2 ${isActive ? 'text-white/60' : 'text-transparent group-hover:text-white/20'}`}>
            {isActive ? (order === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </Link>
      </th>
    )
  }

  return (
    <>
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/10">
                <SortHeader col="name" label="Händler" />
                <SortHeader col="app" label="App" />
                <SortHeader col="login" label="Letzter Login" />
                <SortHeader col="users" label="Nutzer" align="right" />
                <SortHeader col="lastMonth" label={lastMonthName} align="right" />
                <SortHeader col="thisMonth" label={monthName} align="right" />
                <SortHeader col="total" label="Gesamt" align="right" />
                <SortHeader col="status" label="Status" align="center" />
                <SortHeader col="trial" label="Testphase" align="center" />
                <th className="text-right px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {companies.map(company => {
                const latestLoginDate = company.latestLogin?.time ? new Date(company.latestLogin.time) : null
                const trialExpiry = company.trialExpiresAt ? new Date(company.trialExpiresAt) : null

                return (
                  <tr
                    key={company.id}
                    onClick={() => handleOpenModal(company)}
                    title="Klicken, um Firmendaten und Rechnungsadresse anzuzeigen"
                    className="hover:bg-white/[0.07] transition-colors cursor-pointer group"
                  >
                    {/* Clickable Merchant Column */}
                    <td className="px-6 py-4 select-none">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-white group-hover:text-violet-300 transition-colors">
                              {company.name}
                            </p>
                            <span className="text-[10px] font-semibold text-violet-300/90 bg-violet-500/15 border border-violet-500/25 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1">
                              <svg className="w-2.5 h-2.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              Adresse & Firmendaten
                            </span>
                          </div>
                          <p className="text-xs text-white/30 group-hover:text-white/50 transition-colors mt-0.5">
                            {company.email || '–'}
                          </p>
                          {(company.street || company.city) && (
                            <p className="text-[11px] text-white/25 group-hover:text-white/45 transition-colors mt-0.5 truncate max-w-[260px]">
                              {[company.street, [company.zip, company.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                            </p>
                          )}
                        </div>

                        <span className="text-white/20 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all p-1.5 rounded-lg group-hover:bg-violet-500/10">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </div>
                    </td>

                    {/* App */}
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        company.registeredApp === 'ProfiFaktura'
                          ? 'bg-yellow-500/10 text-yellow-500 ring-yellow-500/20'
                          : 'bg-blue-500/10 text-blue-400 ring-blue-400/20'
                      }`}>
                        {company.registeredApp || '–'}
                      </span>
                    </td>

                    {/* Letzter Login */}
                    <td className="px-6 py-4">
                      {latestLoginDate ? (
                        <div>
                          <p className="text-sm text-white">{latestLoginDate.toLocaleDateString('de-DE')}</p>
                          <p className="text-xs text-white/40">{company.latestLogin?.app || 'Unbekannt'}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-white/30">–</span>
                      )}
                    </td>

                    {/* Nutzer */}
                    <td className="px-6 py-4 text-right text-white/60">{company.userCount}</td>

                    {/* Letzter Monat */}
                    <td className="px-6 py-4 text-right text-white/60">{company.lastMonth}</td>

                    {/* Dieser Monat */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-semibold text-white">{company.thisMonth}</span>
                        {company.trend !== null && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${company.trend >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                            {company.trend >= 0 ? '+' : ''}{company.trend}%
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Gesamt */}
                    <td className="px-6 py-4 text-right text-white/40 text-xs">{company.total}</td>

                    {/* Status */}
                    <td className="px-6 py-4 text-center">
                      {company.canceledAt ? (
                        <span className="bg-red-500/10 text-red-400 text-[10px] px-2 py-1 rounded-full font-bold">
                          Gekündigt
                        </span>
                      ) : (
                        <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-1 rounded-full font-bold">
                          Aktiv
                        </span>
                      )}
                    </td>

                    {/* Testphase */}
                    <td className="px-6 py-4 text-center">
                      {trialExpiry ? (
                        (() => {
                          const daysLeft = Math.ceil((trialExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                          if (daysLeft > 0) {
                            return (
                              <span className="bg-blue-500/10 text-blue-400 text-[10px] px-2 py-1 rounded-full font-bold">
                                {daysLeft} Tage
                              </span>
                            )
                          } else {
                            return (
                              <span className="bg-white/5 text-white/30 text-[10px] px-2 py-1 rounded-full">
                                Abgelaufen
                              </span>
                            )
                          }
                        })()
                      ) : (
                        <span className="text-white/20 text-xs">–</span>
                      )}
                    </td>

                    {/* Details Link */}
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/admin/merchants/${company.id}`}
                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors font-medium"
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <MerchantDetailsModal
        company={selectedCompany}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onCompanyUpdated={handleCompanyUpdated}
      />
    </>
  )
}

'use client'

import { useState } from 'react'
import { MerchantDetailsModal, type MerchantCompanyData } from './merchant-details-modal'

interface MerchantNameCellProps {
  company: MerchantCompanyData
  subtitle?: React.ReactNode
  showBadge?: boolean
  className?: string
  children?: React.ReactNode
}

export function MerchantNameCell({
  company,
  subtitle,
  showBadge = true,
  className = '',
  children,
}: MerchantNameCellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentCompany, setCurrentCompany] = useState<MerchantCompanyData>(company)

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOpen(true)
  }

  return (
    <>
      <div
        onClick={handleOpen}
        className={`cursor-pointer group inline-flex flex-col text-left select-none ${className}`}
        title="Klicken, um Firmendaten und Adressen anzuzeigen"
      >
        {children ? (
          children
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-white group-hover:text-violet-300 transition-colors">
                {currentCompany.name}
              </p>
              {showBadge && (
                <span className="text-[10px] font-semibold text-violet-300/90 bg-violet-500/15 border border-violet-500/25 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 shrink-0">
                  <svg className="w-2.5 h-2.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Firmendaten
                </span>
              )}
            </div>

            {subtitle !== undefined ? (
              subtitle
            ) : (
              currentCompany.email && (
                <p className="text-xs text-white/30 group-hover:text-white/50 transition-colors mt-0.5">
                  {currentCompany.email}
                </p>
              )
            )}
          </div>
        )}
      </div>

      <MerchantDetailsModal
        company={currentCompany}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onCompanyUpdated={(updated) => setCurrentCompany(updated)}
      />
    </>
  )
}

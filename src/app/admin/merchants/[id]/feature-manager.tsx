'use client'

import { toggleCompanyFeatureAction } from '@/app/actions/admin'
import { useState, useTransition } from 'react'

export function FeatureManager({ 
  companyId, 
  features 
}: { 
  companyId: string
  features: { returns: boolean; products: boolean } 
}) {
  const [isPending, startTransition] = useTransition()
  const [returnsEnabled, setReturnsEnabled] = useState(features.returns)
  const [productsEnabled, setProductsEnabled] = useState(features.products)

  const handleToggle = (feature: 'returns' | 'products', currentValue: boolean) => {
    const newValue = !currentValue
    if (feature === 'returns') setReturnsEnabled(newValue)
    if (feature === 'products') setProductsEnabled(newValue)

    startTransition(async () => {
      try {
        await toggleCompanyFeatureAction(companyId, feature, newValue)
      } catch (e) {
        alert('Fehler beim Speichern der Einstellung.')
        // Revert on error
        if (feature === 'returns') setReturnsEnabled(currentValue)
        if (feature === 'products') setProductsEnabled(currentValue)
      }
    })
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <p className="text-xs text-white/30 mb-4">Module & Funktionen</p>
      
      <div className="space-y-4">
        {/* Retouren */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Retouren-Modul</p>
            <p className="text-[10px] text-white/40 mt-0.5">Retoureneingang und -bearbeitung</p>
          </div>
          <button
            onClick={() => handleToggle('returns', returnsEnabled)}
            disabled={isPending}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-[#0F172A] transition-colors duration-200 ease-in-out ${returnsEnabled ? 'bg-cyan-500' : 'bg-white/10'}`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${returnsEnabled ? 'translate-x-2' : '-translate-x-2'}`}
            />
          </button>
        </div>

        {/* Produkte */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Produkte-Modul</p>
            <p className="text-[10px] text-white/40 mt-0.5">Produktkatalog und Mapping</p>
          </div>
          <button
            onClick={() => handleToggle('products', productsEnabled)}
            disabled={isPending}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-[#0F172A] transition-colors duration-200 ease-in-out ${productsEnabled ? 'bg-cyan-500' : 'bg-white/10'}`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${productsEnabled ? 'translate-x-2' : '-translate-x-2'}`}
            />
          </button>
        </div>
      </div>
    </div>
  )
}

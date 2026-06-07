'use client'

import { useState } from 'react'

export function MappingSyncRules({ mapping }: { mapping: any }) {
  const [syncStock, setSyncStock] = useState(mapping.syncStock)
  const [syncPrice, setSyncPrice] = useState(mapping.syncPrice)
  const [modifierType, setModifierType] = useState(mapping.priceModifierType)

  return (
    <div className="space-y-4 mt-4 pt-4 border-t border-slate-100">
      <div className="flex items-center gap-3">
        <input 
          type="checkbox" 
          name={`mapping_${mapping.id}_syncStock`} 
          id={`syncStock_${mapping.id}`} 
          checked={syncStock}
          onChange={(e) => setSyncStock(e.target.checked)}
          className="w-4 h-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500 cursor-pointer" 
        />
        <label htmlFor={`syncStock_${mapping.id}`} className="text-sm font-medium text-slate-700 cursor-pointer">
          Bestand synchronisieren
        </label>
      </div>
      
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <input 
            type="checkbox" 
            name={`mapping_${mapping.id}_syncPrice`} 
            id={`syncPrice_${mapping.id}`} 
            checked={syncPrice}
            onChange={(e) => setSyncPrice(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500 cursor-pointer" 
          />
          <label htmlFor={`syncPrice_${mapping.id}`} className="text-sm font-medium text-slate-700 cursor-pointer">
            Preis synchronisieren
          </label>
        </div>
        
        {syncPrice && (
          <div className="flex items-center gap-2 pl-7 animate-in slide-in-from-top-2 duration-300">
            <select 
              name={`mapping_${mapping.id}_priceModifierType`} 
              value={modifierType}
              onChange={(e) => setModifierType(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg py-1.5 px-2 focus:ring-cyan-500 outline-none text-slate-900 bg-white"
            >
              <option value="none">Kein Aufschlag</option>
              <option value="percentage">% Aufschlag</option>
              <option value="fixed">Fixer Aufschlag (€)</option>
            </select>
            {modifierType !== 'none' && (
              <input 
                type="number" 
                step="0.01" 
                name={`mapping_${mapping.id}_priceModifierValue`} 
                defaultValue={Number(mapping.priceModifierValue)} 
                className="w-24 text-sm border border-slate-200 rounded-lg py-1.5 px-3 focus:ring-cyan-500 outline-none text-slate-900 placeholder:text-slate-500" 
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

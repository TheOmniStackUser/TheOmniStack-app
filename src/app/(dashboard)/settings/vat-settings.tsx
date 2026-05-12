'use client'

import { useActionState, useState } from 'react'
import { saveVatSettingAction, deleteVatSettingAction } from '@/app/actions/settings'
import { Trash2, Plus, Percent } from 'lucide-react'

type VatSetting = {
  id: string
  countryCode: string
  vatRate: string
  vatType: string
  localVatId: string | null
}

export function VatSettings({ initialSettings }: { initialSettings: VatSetting[] }) {
  const [state, action, isPending] = useActionState(saveVatSettingAction, undefined)
  const [showAdd, setShowAdd] = useState(false)
  const [vatType, setVatType] = useState('oss')
  const [selectedCountry, setSelectedCountry] = useState('')
  const [vatRateValue, setVatRateValue] = useState('')

  const getSuggestedRate = (countryCode: string, type: string) => {
    if (type === 'third_country') return '0'
    
    const rates: Record<string, string> = {
      'DE': '19', 'AT': '20', 'FR': '20', 'IT': '22', 'ES': '21',
      'NL': '21', 'BE': '21', 'LU': '17', 'DK': '25', 'PL': '23',
      'CZ': '21', 'SE': '25', 'FI': '25.5', 'IE': '23', 'PT': '23',
      'GR': '24', 'HU': '27', 'RO': '19', 'BG': '20', 'HR': '25',
      'SI': '22', 'SK': '20', 'EE': '22', 'LV': '21', 'LT': '21',
      'MT': '18', 'CY': '19',
    }
    return rates[countryCode] || ''
  }

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value
    setSelectedCountry(code)
    const suggested = getSuggestedRate(code, vatType)
    if (suggested) setVatRateValue(suggested)
  }

  const handleVatTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value
    setVatType(newType)
    const suggested = getSuggestedRate(selectedCountry, newType)
    if (suggested) setVatRateValue(suggested)
  }

  const countries = [
    { code: 'DE', name: 'Deutschland' },
    { code: 'AT', name: 'Österreich' },
    { code: 'CH', name: 'Schweiz' },
    { code: 'FR', name: 'Frankreich' },
    { code: 'IT', name: 'Italien' },
    { code: 'ES', name: 'Spanien' },
    { code: 'NL', name: 'Niederlande' },
    { code: 'BE', name: 'Belgien' },
    { code: 'LU', name: 'Luxemburg' },
    { code: 'DK', name: 'Dänemark' },
    { code: 'PL', name: 'Polen' },
    { code: 'CZ', name: 'Tschechien' },
    { code: 'SE', name: 'Schweden' },
    { code: 'FI', name: 'Finnland' },
    { code: 'IE', name: 'Irland' },
    { code: 'PT', name: 'Portugal' },
    { code: 'GR', name: 'Griechenland' },
    { code: 'HU', name: 'Ungarn' },
    { code: 'RO', name: 'Rumänien' },
    { code: 'BG', name: 'Bulgarien' },
    { code: 'HR', name: 'Kroatien' },
    { code: 'SI', name: 'Slowenien' },
    { code: 'SK', name: 'Slowakei' },
    { code: 'EE', name: 'Estland' },
    { code: 'LV', name: 'Lettland' },
    { code: 'LT', name: 'Litauen' },
    { code: 'MT', name: 'Malta' },
    { code: 'CY', name: 'Zypern' },
    { code: 'GB', name: 'Großbritannien' },
    { code: 'US', name: 'USA' },
  ]

  const existingCodes = new Set(initialSettings.map(s => s.countryCode))
  const availableCountries = countries.filter(c => !existingCodes.has(c.code))

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Umsatzsteuersätze pro Land</h3>
          <p className="text-sm text-gray-500">Konfiguriere OSS, lokale Registrierungen oder Drittland-Regelungen.</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
        >
          <Plus size={16} />
          {showAdd ? 'Abbrechen' : 'Land hinzufügen'}
        </button>
      </div>

      <div className="p-6 space-y-6">
        {showAdd && (
          <form action={action} className="p-4 bg-gray-50 rounded-2xl border border-gray-200 animate-in fade-in slide-in-from-top-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Land</label>
                <select
                  name="countryCode"
                  value={selectedCountry}
                  onChange={handleCountryChange}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                  required
                >
                  <option value="">Auswählen...</option>
                  {availableCountries.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Regelung</label>
                <select
                  name="vatType"
                  value={vatType}
                  onChange={handleVatTypeChange}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                >
                  <option value="oss">OSS (Lokale Steuer)</option>
                  <option value="local">Lokale Registrierung</option>
                  <option value="third_country">Drittland (0% Steuer)</option>
                  <option value="below_threshold">Lieferschwelle (DE Steuer)</option>
                </select>
              </div>
              
              {vatType !== 'third_country' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Steuersatz (%)</label>
                  <div className="relative">
                    <input
                      name="vatRate"
                      type="text"
                      value={vatRateValue}
                      onChange={(e) => setVatRateValue(e.target.value)}
                      placeholder="20"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none pr-10 text-gray-900 placeholder:text-gray-400"
                      required
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Percent size={16} />
                    </div>
                  </div>
                </div>
              )}

              {vatType === 'local' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Lokale USt-IdNr.</label>
                  <input
                    name="localVatId"
                    type="text"
                    placeholder="ATU12345678"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 placeholder:text-gray-400"
                    required
                  />
                </div>
              )}

              <div className="flex items-end lg:col-start-4">
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all disabled:opacity-50"
                >
                  {isPending ? 'Speichert...' : 'Hinzufügen'}
                </button>
              </div>
            </div>
            {state?.message && (
              <p className={`mt-3 text-sm font-medium ${state.success ? 'text-green-600' : 'text-red-600'}`}>
                {state.message}
              </p>
            )}
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="pb-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Land</th>
                <th className="pb-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Regelung</th>
                <th className="pb-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Steuersatz</th>
                <th className="pb-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {initialSettings.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-gray-500 text-sm italic">
                    Keine länderspezifischen Steuersätze hinterlegt. Es werden die Standardwerte der Marktplätze verwendet.
                  </td>
                </tr>
              ) : (
                initialSettings.map((setting) => (
                  <tr key={setting.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-gray-600 text-xs">
                          {setting.countryCode}
                        </span>
                        <span className="font-medium text-gray-900">{getCountryName(setting.countryCode)}</span>
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-900">
                          {setting.vatType === 'oss' && 'OSS'}
                          {setting.vatType === 'local' && 'Lokale Reg.'}
                          {setting.vatType === 'third_country' && 'Drittland'}
                          {setting.vatType === 'below_threshold' && 'Lieferschwelle'}
                        </span>
                        {setting.localVatId && (
                          <span className="text-xs text-gray-500">{setting.localVatId}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 font-mono text-gray-600">
                      {(parseFloat(setting.vatRate) * 100).toFixed(0)}%
                    </td>
                    <td className="py-4 text-right">
                      <button
                        onClick={async () => {
                          if (confirm('Diesen Steuersatz wirklich löschen?')) {
                            await deleteVatSettingAction(setting.id)
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function getCountryName(code: string) {
  const names: Record<string, string> = {
    'DE': 'Deutschland',
    'AT': 'Österreich',
    'CH': 'Schweiz',
    'FR': 'Frankreich',
    'IT': 'Italien',
    'ES': 'Spanien',
    'NL': 'Niederlande',
    'BE': 'Belgien',
    'PL': 'Polen',
    'CZ': 'Tschechien',
    'DK': 'Dänemark',
  }
  return names[code] || code
}

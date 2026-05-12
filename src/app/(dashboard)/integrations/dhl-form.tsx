'use client'

import { useState, useActionState } from 'react'
import { saveDhlIntegrationAction } from '@/app/actions/integrations'

// ─── DHL Product Codes ──────────────────────────────────────────────────────
const DHL_PRODUCTS = [
  { value: 'V01PAK', label: 'DHL Paket' },
  { value: 'V01PRIO', label: 'DHL Paket Prio' },
  { value: 'V06PAK', label: 'DHL Paket International' },
  { value: 'V53WPAK', label: 'DHL Europaket' },
  { value: 'V54EPAK', label: 'DHL Eurapäisches Paket' },
  { value: 'V55PAK', label: 'DHL Paket Connect' },
  { value: 'V62WP', label: 'Warenpost' },
  { value: 'V66WPI', label: 'Warenpost International' },
  { value: 'V86PARCEL', label: 'DHL Kleinpaket' },
  { value: 'V87PARCEL', label: 'DHL Kleinpaket International' },
  { value: 'V07PAK', label: 'DHL Retoure Online' },
]

const DHL_SERVICES = [
  'Paketankündigung',
  'Premiumversand',
  'Alterssichtprüfung',
  'Ident-Check',
  'Nachnahme',
  'Versandbestätigung',
  'Retoure sofort',
]

const DHL_RETURN_TYPES = [
  { value: '', label: 'Keine Retoure' },
  { value: 'V07PAK', label: 'DHL Retoure Online (V07PAK)' },
  { value: 'V07PRIO', label: 'DHL Retoure Online Prio (V07PRIO)' },
  { value: 'V53WPAK', label: 'DHL Retoure Europaket (V53WPAK)' },
  { value: 'V06PAK', label: 'DHL Retoure International (V06PAK)' },
]

export type DhlShippingZone = {
  id: string
  name: string
  billingNumber: string
  returnBillingNumber: string
  productCode: string
  description: string
}

export type DhlProduct = {
  id: string
  productCode: string
  name: string
  returnType: string
  exportAllowed: boolean
  additionalServices: string[]
}

export type DhlConfig = {
  username: string
  password: string
  apiKey: string
  apiSecret: string
  accountNumber: string
  environment: 'production' | 'sandbox'
  defaultWeight: number
  defaultLengthCm: number
  defaultWidthCm: number
  defaultHeightCm: number
  zones: DhlShippingZone[]
  products: DhlProduct[]
  platformReturns: Record<string, 'online' | 'enclosed_with_label' | 'enclosed_without_label'>
}

const DEFAULT_ZONES: DhlShippingZone[] = [
  { id: 'domestic', name: 'Versand innerhalb Deutschlands', billingNumber: '', returnBillingNumber: '', productCode: 'V01PAK', description: 'z.B. 33844215670101' },
  { id: 'connect', name: 'Versand in DHL-Connect-Länder', billingNumber: '', returnBillingNumber: '', productCode: 'V55PAK', description: 'Belgien, Deutschland, Luxemburg, NL, Österreich, Polen, Slowakei, Tschechien' },
  { id: 'eu', name: 'Versand innerhalb Europas', billingNumber: '', returnBillingNumber: '', productCode: 'V53WPAK', description: 'Ohne Zypern & Malta, zzgl. Schweiz' },
  { id: 'international', name: 'Versand außerhalb Europas', billingNumber: '', returnBillingNumber: '', productCode: 'V06PAK', description: 'Weltweit' },
  { id: 'warenpost', name: 'Warenpost / Kleinpaket', billingNumber: '', returnBillingNumber: '', productCode: 'V62WP', description: 'Für leichte Sendungen bis 1 kg' },
  { id: 'cash_on_delivery', name: 'Nachnahme', billingNumber: '', returnBillingNumber: '', productCode: 'V01PAK', description: 'Zahlung bei Lieferung' },
]

function generateId() {
  return Math.random().toString(36).slice(2, 9)
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function ZoneRow({ zone, onChange }: { zone: DhlShippingZone; onChange: (z: DhlShippingZone) => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-yellow-400 rounded-full flex-shrink-0" />
        <h4 className="font-semibold text-gray-800 text-sm">{zone.name}</h4>
        {zone.description && (
          <span className="text-xs text-gray-400 italic">{zone.description}</span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Abrechnungsnummer</label>
          <input
            type="text"
            value={zone.billingNumber}
            onChange={e => onChange({ ...zone, billingNumber: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-900 placeholder-gray-400"
            placeholder="z.B. 33844215670101"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Retouren-Abrechnungsnummer</label>
          <input
            type="text"
            value={zone.returnBillingNumber}
            onChange={e => onChange({ ...zone, returnBillingNumber: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-900 placeholder-gray-400"
            placeholder="z.B. 33844215670702"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Produkt-Code</label>
          <select
            value={zone.productCode}
            onChange={e => onChange({ ...zone, productCode: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white text-gray-900"
          >
            {DHL_PRODUCTS.map(p => (
              <option key={p.value} value={p.value}>{p.value} – {p.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

function ProductRow({ product, onChange, onDelete }: { product: DhlProduct; onChange: (p: DhlProduct) => void; onDelete: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="grid grid-cols-12 gap-4 items-start">
        {/* Product Code */}
        <div className="col-span-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Produkt</label>
          <select
            value={product.productCode}
            onChange={e => onChange({ ...product, productCode: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-gray-900"
          >
            {DHL_PRODUCTS.map(p => (
              <option key={p.value} value={p.value}>{p.value} – {p.label}</option>
            ))}
          </select>
        </div>

        {/* Name */}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
          <input
            type="text"
            value={product.name}
            onChange={e => onChange({ ...product, name: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 text-gray-900"
            placeholder="z.B. DHL Paket"
          />
        </div>

        {/* Return Type */}
        <div className="col-span-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Retouren-Art</label>
          <select
            value={product.returnType ?? ''}
            onChange={e => onChange({ ...product, returnType: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-gray-900"
          >
            {DHL_RETURN_TYPES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Export */}
        <div className="col-span-1 flex flex-col items-center pt-5">
          <label className="block text-xs font-medium text-gray-500 mb-2">Export</label>
          <input
            type="checkbox"
            checked={product.exportAllowed}
            onChange={e => onChange({ ...product, exportAllowed: e.target.checked })}
            className="w-5 h-5 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
          />
        </div>

        {/* Additional Services */}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Zusatzleistungen</label>
          <div className="flex flex-wrap gap-1">
            {product.additionalServices.map(svc => (
              <span key={svc} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">
                {svc}
                <button
                  type="button"
                  onClick={() => onChange({ ...product, additionalServices: product.additionalServices.filter(s => s !== svc) })}
                  className="text-gray-400 hover:text-red-500"
                >×</button>
              </span>
            ))}
            <div className="relative group">
              <button
                type="button"
                className="w-5 h-5 rounded-full border border-dashed border-gray-400 text-gray-400 hover:border-yellow-500 hover:text-yellow-600 flex items-center justify-center text-sm leading-none"
              >+</button>
              <div className="absolute left-0 top-6 z-10 hidden group-hover:block bg-white border border-gray-200 rounded-lg shadow-lg p-1 w-48">
                {DHL_SERVICES.filter(s => !product.additionalServices.includes(s)).map(svc => (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => onChange({ ...product, additionalServices: [...product.additionalServices, svc] })}
                    className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-yellow-50 hover:text-yellow-800 rounded-md"
                  >{svc}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Delete */}
        <div className="col-span-1 flex items-end justify-center pt-5">
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Form ────────────────────────────────────────────────────────────────

export function DhlIntegrationForm({ initialConfig }: { initialConfig?: DhlConfig }) {
  const [activeTab, setActiveTab] = useState<'connection' | 'general' | 'zones' | 'products' | 'returns'>('connection')
  const [state, formAction, pending] = useActionState(saveDhlIntegrationAction, undefined)

  const [username, setUsername] = useState(initialConfig?.username ?? '')
  const [password, setPassword] = useState(initialConfig?.password ?? '')
  const [apiKey, setApiKey] = useState(initialConfig?.apiKey ?? '')
  const [apiSecret, setApiSecret] = useState(initialConfig?.apiSecret ?? '')
  const [accountNumber, setAccountNumber] = useState(initialConfig?.accountNumber ?? '')
  const [env, setEnv] = useState<'production' | 'sandbox'>(initialConfig?.environment ?? 'production')

  const [defaultWeight, setDefaultWeight] = useState(initialConfig?.defaultWeight ?? 1)
  const [defaultLength, setDefaultLength] = useState(initialConfig?.defaultLengthCm ?? 30)
  const [defaultWidth, setDefaultWidth] = useState(initialConfig?.defaultWidthCm ?? 20)
  const [defaultHeight, setDefaultHeight] = useState(initialConfig?.defaultHeightCm ?? 10)

  const [zones, setZones] = useState<DhlShippingZone[]>(initialConfig?.zones ?? DEFAULT_ZONES)
  const [products, setProducts] = useState<DhlProduct[]>(initialConfig?.products ?? [
    { id: generateId(), productCode: 'V01PAK', name: 'DHL Paket', returnType: 'V07PAK', exportAllowed: false, additionalServices: ['Paketankündigung'] },
    { id: generateId(), productCode: 'V07PAK', name: 'DHL Retoure Online', returnType: '', exportAllowed: false, additionalServices: [] },
  ])

  const DEFAULT_PLATFORM_RETURNS: DhlConfig['platformReturns'] = {
    otto: 'enclosed_without_label',
    amazon: 'online',
    mirakl_decathlon: 'online',
    hermes: 'online',
  }
  const [platformReturns, setPlatformReturns] = useState<DhlConfig['platformReturns']>(
    initialConfig?.platformReturns ?? DEFAULT_PLATFORM_RETURNS
  )

  const updateZone = (id: string, updated: DhlShippingZone) => {
    setZones(prev => prev.map(z => z.id === id ? updated : z))
  }

  const addProduct = () => {
    setProducts(prev => [...prev, { id: generateId(), productCode: 'V01PAK', name: '', returnType: '', exportAllowed: false, additionalServices: [] }])
  }

  const updateProduct = (id: string, updated: DhlProduct) => {
    setProducts(prev => prev.map(p => p.id === id ? updated : p))
  }

  const removeProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  const config: DhlConfig = {
    username, password, apiKey, apiSecret, accountNumber, environment: env,
    defaultWeight, defaultLengthCm: defaultLength, defaultWidthCm: defaultWidth, defaultHeightCm: defaultHeight,
    zones, products, platformReturns,
  }

  const tabs = [
    { id: 'connection', label: 'Verbindung' },
    { id: 'general', label: 'Allgemein' },
    { id: 'zones', label: 'Abrechnungsnummern' },
    { id: 'products', label: 'Produkte' },
    { id: 'returns', label: 'Retouren' },
  ] as const

  type TabId = typeof tabs[number]['id']

  return (
    <form action={formAction}>
      {/* Hidden fields to submit the full config */}
      <input type="hidden" name="dhlConfig" value={JSON.stringify(config)} />

      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 mb-6 -mt-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-yellow-400 text-yellow-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >{tab.label}</button>
        ))}
      </div>

      {/* ── Tab: Verbindung ──────────────────────────────────────── */}
      {activeTab === 'connection' && (
        <div className="space-y-5">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800 flex items-start gap-3">
            <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-semibold mb-1">DHL Geschäftskundenportal (VLS) – Zwei Zugangsdaten nötig</p>
              <p className="mb-1">1. <strong>Benutzername &amp; Passwort</strong>: Deine Login-Daten vom <a href="https://geschaeftskunden.dhl.de" target="_blank" className="underline">DHL Geschäftskundenportal</a>.</p>
              <p>2. <strong>API Key</strong>: Ein separater Schlüssel vom <a href="https://developer.dhl.com" target="_blank" className="underline">DHL Developer Portal</a> (developer.dhl.com → My Apps → App erstellen → Parcel DE Shipping Post).</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Benutzername (GKP Login)</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-900 placeholder-gray-400"
                placeholder="max.mustermann@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Passwort (GKP Login)</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-900"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              API Key
              <span className="ml-2 text-xs font-normal text-gray-400">(vom DHL Developer Portal – developer.dhl.com)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-900"
              placeholder="z.B. 9Dsh3729sJd..."
            />
            <p className="mt-1.5 text-xs text-gray-400">Erstelle eine App unter developer.dhl.com → My Apps → &quot;Parcel DE Shipping Post&quot; hinzufügen.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              API Secret
              <span className="ml-2 text-xs font-normal text-gray-400">(vom DHL Developer Portal – App Secret)</span>
            </label>
            <input
              type="password"
              value={apiSecret}
              onChange={e => setApiSecret(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-900"
              placeholder="z.B. aBcDeFgH..."
            />
            <p className="mt-1.5 text-xs text-gray-400">Das App Secret findest du direkt neben dem API Key in deiner DHL Developer App.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Kundennummer (EKP)</label>
              <input
                type="text"
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-gray-900 placeholder-gray-400"
                placeholder="z.B. 3384421567 (10 Stellen)"
              />
              <p className="mt-1 text-xs text-gray-400">Deine 10-stellige DHL Kundennummer</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Umgebung</label>
              <select
                value={env}
                onChange={e => setEnv(e.target.value as 'production' | 'sandbox')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-gray-900"
              >
                <option value="production">Produktion (Live)</option>
                <option value="sandbox">Sandbox (Test)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Allgemein ──────────────────────────────────────── */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-4">Grundeinstellungen</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Versandland</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-gray-900" defaultValue="DE">
                  <option value="DE">Deutschland</option>
                  <option value="AT">Österreich</option>
                  <option value="CH">Schweiz</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Standardgewicht</label>
                <div className="flex">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={defaultWeight}
                    onChange={e => setDefaultWeight(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 text-gray-900"
                  />
                  <span className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-600 text-sm">kg</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">z.B. 2 kg</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Maße in cm (Länge × Breite × Höhe)</label>
            <div className="flex items-center gap-2">
              <input type="number" min="1" value={defaultLength} onChange={e => setDefaultLength(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 text-gray-900" placeholder="Länge" />
              <span className="text-gray-400 font-bold">×</span>
              <input type="number" min="1" value={defaultWidth} onChange={e => setDefaultWidth(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 text-gray-900" placeholder="Breite" />
              <span className="text-gray-400 font-bold">×</span>
              <input type="number" min="1" value={defaultHeight} onChange={e => setDefaultHeight(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 text-gray-900" placeholder="Höhe" />
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Abrechnungsnummern ──────────────────────────────── */}
      {activeTab === 'zones' && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 border border-gray-200">
            <p>Die Abrechnungsnummern (auch Teilnahmenummern genannt) bestehen aus deiner <strong>Kundennummer (EKP)</strong> + Produkt-Kennzeichen + Teilnahme-Nummer. Du findest sie im DHL Geschäftskundenportal.</p>
          </div>
          {zones.map(zone => (
            <ZoneRow key={zone.id} zone={zone} onChange={updated => updateZone(zone.id, updated)} />
          ))}
        </div>
      )}

      {/* ── Tab: Produkte ────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-4">
            Lege hier deine aktiven DHL-Produkte fest. Diese erscheinen beim Label-Druck als Auswahlmöglichkeit.
          </div>

          {/* Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div className="col-span-3">Produkt</div>
            <div className="col-span-2">Name</div>
            <div className="col-span-3">Retouren-Art</div>
            <div className="col-span-1 text-center">Export</div>
            <div className="col-span-2">Zusatzleistungen</div>
            <div className="col-span-1"></div>
          </div>

          {products.map(product => (
            <ProductRow
              key={product.id}
              product={product}
              onChange={updated => updateProduct(product.id, updated)}
              onDelete={() => removeProduct(product.id)}
            />
          ))}

          <button
            type="button"
            onClick={addProduct}
            className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-yellow-300 text-yellow-700 rounded-lg text-sm font-medium hover:border-yellow-400 hover:bg-yellow-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Produkt hinzufügen
          </button>
        </div>
      )}

      {/* ── Tab: Retouren ────────────────────────────────────────── */}
      {activeTab === 'returns' && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 border border-gray-200">
            <p>Lege hier fest, welche <strong>Retourenmethode</strong> für jede Plattform verwendet werden soll. Manche Plattformen (z. B. Otto) stellen das Retouren-Label selbst bereit – hier genügt ein beiliegender Retourenschein ohne Label.</p>
          </div>

          {([
            { key: 'otto',             label: 'Otto',              icon: '🟥', hint: 'Otto-Kunden drucken das Label über das Otto-Portal – kein eigenes Label nötig.' },
            { key: 'amazon',           label: 'Amazon',            icon: '🟧', hint: 'Amazon bietet ein eigenes Retouren-Portal an.' },
            { key: 'mirakl_decathlon', label: 'Decathlon (Mirakl)', icon: '🟦', hint: '' },
            { key: 'hermes',           label: 'Hermes',            icon: '🟪', hint: '' },
          ] as const).map(({ key, label, icon, hint }) => {
            const value = platformReturns[key] ?? 'online'
            return (
              <div key={key} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-lg">{icon}</span>
                  <div>
                    <h4 className="font-semibold text-gray-800 text-sm">{label}</h4>
                    {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    {
                      v: 'online' as const,
                      title: 'DHL Online Retoure',
                      desc: 'DHL erstellt ein Retouren-Label online. Der Kunde erhält einen Link oder QR-Code per E-Mail.',
                    },
                    {
                      v: 'enclosed_with_label' as const,
                      title: 'Beilage mit Label',
                      desc: 'Ein gedrucktes DHL-Retourenlabel wird dem Paket beigelegt.',
                    },
                    {
                      v: 'enclosed_without_label' as const,
                      title: 'Beilage ohne Label',
                      desc: 'Ein Retourenschein ohne Label wird beigelegt. Der Kunde druckt das Label über die Plattform.',
                    },
                  ] as const).map(opt => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setPlatformReturns(prev => ({ ...prev, [key]: opt.v }))}
                      className={`flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all ${
                        value === opt.v
                          ? 'border-yellow-400 bg-yellow-50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-yellow-200 hover:bg-yellow-50/50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                        value === opt.v ? 'border-yellow-500 bg-yellow-400' : 'border-gray-300'
                      }`} />
                      <span className={`text-sm font-semibold ${value === opt.v ? 'text-yellow-800' : 'text-gray-700'}`}>
                        {opt.title}
                      </span>
                      <span className="text-xs text-gray-500 leading-relaxed">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Status Message */}

      {state?.message && (
        <div className={`mt-6 p-4 rounded-lg text-sm flex items-center gap-2 ${state.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {state.success
            ? <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            : <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
          }
          {state.message}
        </div>
      )}

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="px-8 py-3 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {pending && (
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          )}
          {pending ? 'Wird gespeichert...' : 'Speichern'}
        </button>
      </div>
    </form>
  )
}

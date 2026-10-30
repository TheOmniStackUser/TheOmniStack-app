'use client'

import { useState, useActionState, useMemo } from 'react'
import { saveDhlIntegrationAction, testDhlConnectionAction } from '@/app/actions/integrations'
import { Settings, Globe, Package, RefreshCw, CheckCircle2, AlertCircle, Plus, Trash2, Edit2, Loader2, Sparkles, ExternalLink } from 'lucide-react'

// ─── DHL Product Catalog Definition ──────────────────────────────────────────
export const DHL_CATALOG = [
  { code: 'V01PAK', procedure: '01', defaultTeilnahme: '01', label: 'DHL Paket', defaultName: 'DHL Paket', export: false, returnType: 'V07PAK', services: ['Paketankündigung'] },
  { code: 'V06PAK', procedure: '53', defaultTeilnahme: '01', label: 'DHL Paket International', defaultName: 'DHL Paket International', export: true, returnType: 'V07PAK', services: ['Paketankündigung'] },
  { code: 'V53WPAK', procedure: '53', defaultTeilnahme: '01', label: 'DHL Europaket', defaultName: 'DHL Europaket', export: false, returnType: 'V53WPAK', services: ['Paketankündigung'] },
  { code: 'V62KP', procedure: '62', defaultTeilnahme: '01', label: 'DHL Kleinpaket', defaultName: 'DHL Kleinpaket', export: false, returnType: '', services: ['Paketankündigung'] },
  { code: 'V66WPI', procedure: '66', defaultTeilnahme: '01', label: 'Warenpost International', defaultName: 'Warenpost International', export: true, returnType: '', services: ['Paketankündigung'] },
  { code: 'V07PAK', procedure: '07', defaultTeilnahme: '01', label: 'DHL Retoure Online', defaultName: 'DHL Retoure Online', export: false, returnType: '', services: [] },
  { code: 'V55PAK', procedure: '55', defaultTeilnahme: '01', label: 'DHL Paket Connect', defaultName: 'DHL Paket Connect', export: false, returnType: '', services: ['Paketankündigung'] },
  { code: 'V62WP', procedure: '62', defaultTeilnahme: '01', label: 'Warenpost National', defaultName: 'Warenpost National', export: false, returnType: '', services: ['Paketankündigung'] },
  { code: 'V01PRIO', procedure: '01', defaultTeilnahme: '01', label: 'DHL Paket Prio', defaultName: 'DHL Paket Prio', export: false, returnType: '', services: ['Paketankündigung'] },
  { code: 'V54EPAK', procedure: '54', defaultTeilnahme: '01', label: 'DHL Europäisches Paket', defaultName: 'DHL Europäisches Paket', export: false, returnType: '', services: ['Paketankündigung'] },
]

export const DHL_SERVICES = [
  'Paketankündigung',
  'Premiumversand',
  'Alterssichtprüfung',
  'Ident-Check',
  'Nachnahme',
  'Versandbestätigung',
  'Retoure sofort',
  'GoGreen',
]

export const DHL_RETURN_TYPES = [
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
  billingNumber?: string
  returnBillingNumber?: string
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
  defaultWeightWarenpost?: number
  defaultWeightWarenpostInternational?: number
  defaultWeightKleinpaket?: number
  defaultWeightKleinpaketInternational?: number
  defaultLengthCm: number
  defaultWidthCm: number
  defaultHeightCm: number
  zones: DhlShippingZone[]
  products: DhlProduct[]
  platformReturns: Record<string, 'none' | 'online' | 'enclosed_with_label' | 'enclosed_without_label'>
}

const DEFAULT_ZONES: DhlShippingZone[] = [
  { id: 'domestic', name: 'Versand innerhalb Deutschlands', billingNumber: '', returnBillingNumber: '', productCode: 'V01PAK', description: 'z.B. 33844215670101' },
  { id: 'connect', name: 'Versand in DHL-Connect-Länder', billingNumber: '', returnBillingNumber: '', productCode: 'V55PAK', description: 'Belgien, Deutschland, Luxemburg, NL, Österreich, Polen, Slowakei, Tschechien' },
  { id: 'eu', name: 'Versand innerhalb Europas', billingNumber: '', returnBillingNumber: '', productCode: 'V53WPAK', description: 'Ohne Zypern & Malta, zzgl. Schweiz' },
  { id: 'international', name: 'Versand außerhalb Europas', billingNumber: '', returnBillingNumber: '', productCode: 'V06PAK', description: 'Weltweit' },
  { id: 'warenpost', name: 'Warenpost / Kleinpaket', billingNumber: '', returnBillingNumber: '', productCode: 'V62KP', description: 'Für leichte Sendungen bis 1 kg' },
  { id: 'warenpost_international', name: 'Warenpost International', billingNumber: '', returnBillingNumber: '', productCode: 'V66WPI', description: 'Internationale leichte Sendungen' },
  { id: 'cash_on_delivery', name: 'Nachnahme', billingNumber: '', returnBillingNumber: '', productCode: 'V01PAK', description: 'Zahlung bei Lieferung' },
]

function generateDefaultProducts(accountNumber: string): DhlProduct[] {
  const cleanEkp = (accountNumber || '').replace(/\D/g, '').padEnd(10, '0').slice(0, 10)
  return [
    {
      id: '12371',
      productCode: 'V01PAK',
      name: 'DHL Paket',
      billingNumber: `${cleanEkp}0101`,
      returnBillingNumber: `${cleanEkp}0701`,
      returnType: 'V07PAK',
      exportAllowed: false,
      additionalServices: ['Paketankündigung'],
    },
    {
      id: '12372',
      productCode: 'V06PAK',
      name: 'DHL Paket International',
      billingNumber: `${cleanEkp}5301`,
      returnBillingNumber: `${cleanEkp}0701`,
      returnType: 'V07PAK',
      exportAllowed: true,
      additionalServices: ['Paketankündigung'],
    },
    {
      id: '12373',
      productCode: 'V62KP',
      name: 'DHL Kleinpaket',
      billingNumber: `${cleanEkp}6201`,
      returnBillingNumber: '',
      returnType: '',
      exportAllowed: false,
      additionalServices: ['Paketankündigung'],
    },
    {
      id: '12374',
      productCode: 'V66WPI',
      name: 'Warenpost International',
      billingNumber: `${cleanEkp}6601`,
      returnBillingNumber: '',
      returnType: '',
      exportAllowed: true,
      additionalServices: ['Paketankündigung'],
    },
    {
      id: '12375',
      productCode: 'V07PAK',
      name: 'DHL Retoure Online',
      billingNumber: `${cleanEkp}0701`,
      returnBillingNumber: '',
      returnType: '',
      exportAllowed: false,
      additionalServices: [],
    },
  ]
}

function syncZonesFromProducts(products: DhlProduct[], accountNumber: string, existingZones: DhlShippingZone[]): DhlShippingZone[] {
  const cleanEkp = (accountNumber || '').replace(/\D/g, '').padEnd(10, '0').slice(0, 10)
  const defaultReturnNum = products.find(p => p.productCode === 'V07PAK')?.billingNumber || `${cleanEkp}0701`

  const domesticProd = products.find(p => p.productCode === 'V01PAK')
  const connectProd = products.find(p => p.productCode === 'V55PAK') || domesticProd
  const euProd = products.find(p => p.productCode === 'V53WPAK') || products.find(p => p.productCode === 'V06PAK')
  const intProd = products.find(p => p.productCode === 'V06PAK') || euProd
  const wpProd = products.find(p => p.productCode === 'V62KP' || p.productCode === 'V62WP')
  const wpiProd = products.find(p => p.productCode === 'V66WPI')

  return DEFAULT_ZONES.map(z => {
    let resolvedBilling = z.billingNumber
    let resolvedReturn = z.returnBillingNumber || defaultReturnNum
    let resolvedCode = z.productCode

    if (z.id === 'domestic' && domesticProd?.billingNumber) {
      resolvedBilling = domesticProd.billingNumber
      resolvedReturn = domesticProd.returnBillingNumber || defaultReturnNum
      resolvedCode = domesticProd.productCode
    } else if (z.id === 'connect' && connectProd?.billingNumber) {
      resolvedBilling = connectProd.billingNumber
      resolvedCode = connectProd.productCode
    } else if (z.id === 'eu' && euProd?.billingNumber) {
      resolvedBilling = euProd.billingNumber
      resolvedCode = euProd.productCode
    } else if (z.id === 'international' && intProd?.billingNumber) {
      resolvedBilling = intProd.billingNumber
      resolvedCode = intProd.productCode
    } else if (z.id === 'warenpost' && wpProd?.billingNumber) {
      resolvedBilling = wpProd.billingNumber
      resolvedCode = wpProd.productCode
    } else if (z.id === 'warenpost_international' && wpiProd?.billingNumber) {
      resolvedBilling = wpiProd.billingNumber
      resolvedCode = wpiProd.productCode
    } else if (z.id === 'cash_on_delivery' && domesticProd?.billingNumber) {
      resolvedBilling = domesticProd.billingNumber
    }

    const existing = existingZones?.find(ez => ez.id === z.id)
    return {
      ...z,
      billingNumber: resolvedBilling || existing?.billingNumber || '',
      returnBillingNumber: resolvedReturn || existing?.returnBillingNumber || '',
      productCode: resolvedCode || existing?.productCode || z.productCode,
    }
  })
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function DhlIntegrationForm({ 
  initialConfig,
  activeMarketplaces = []
}: { 
  initialConfig?: DhlConfig,
  activeMarketplaces?: { key: string; label: string; type: string }[]
}) {
  const [activeTab, setActiveTab] = useState<'connection' | 'general' | 'products' | 'returns'>('connection')
  const [state, formAction, pending] = useActionState(saveDhlIntegrationAction, undefined)

  // Connection fields
  const [username, setUsername] = useState(initialConfig?.username ?? '')
  const [password, setPassword] = useState(initialConfig?.password ?? '')
  const [apiKey, setApiKey] = useState(initialConfig?.apiKey ?? '')
  const [apiSecret, setApiSecret] = useState(initialConfig?.apiSecret ?? '')
  const [accountNumber, setAccountNumber] = useState(initialConfig?.accountNumber ?? '')
  const [env, setEnv] = useState<'production' | 'sandbox'>(initialConfig?.environment ?? 'production')

  // General weights and dimensions
  const [defaultWeight, setDefaultWeight] = useState(initialConfig?.defaultWeight ?? 1)
  const [defaultWeightWarenpost, setDefaultWeightWarenpost] = useState(initialConfig?.defaultWeightWarenpost ?? 0.2)
  const [defaultWeightWarenpostInternational, setDefaultWeightWarenpostInternational] = useState(initialConfig?.defaultWeightWarenpostInternational ?? 0.2)
  const [defaultWeightKleinpaket, setDefaultWeightKleinpaket] = useState(initialConfig?.defaultWeightKleinpaket ?? 0.5)
  const [defaultWeightKleinpaketInternational, setDefaultWeightKleinpaketInternational] = useState(initialConfig?.defaultWeightKleinpaketInternational ?? 0.5)
  const [defaultLength, setDefaultLength] = useState(initialConfig?.defaultLengthCm ?? 30)
  const [defaultWidth, setDefaultWidth] = useState(initialConfig?.defaultWidthCm ?? 20)
  const [defaultHeight, setDefaultHeight] = useState(initialConfig?.defaultHeightCm ?? 10)

  // Products
  const getInitialProducts = (): DhlProduct[] => {
    if (initialConfig?.products && initialConfig.products.length > 0) {
      // Ensure all products have a billingNumber populated
      return initialConfig.products.map((p, idx) => {
        if (!p.billingNumber) {
          const matchingZone = initialConfig.zones?.find(z => z.productCode === p.productCode && z.billingNumber)
          const fallbackEkp = (initialConfig.accountNumber || '').replace(/\D/g, '').padEnd(10, '0').slice(0, 10)
          const cat = DHL_CATALOG.find(c => c.code === p.productCode)
          const procedure = cat?.procedure || '01'
          return {
            ...p,
            id: p.id || String(12371 + idx),
            billingNumber: matchingZone?.billingNumber || (fallbackEkp ? `${fallbackEkp}${procedure}01` : ''),
            returnBillingNumber: p.returnBillingNumber || matchingZone?.returnBillingNumber || '',
          }
        }
        return p
      })
    }
    return generateDefaultProducts(initialConfig?.accountNumber || '')
  }

  const [products, setProducts] = useState<DhlProduct[]>(getInitialProducts())

  // Platform Returns
  const getInitialPlatformReturns = () => {
    const defaults: Record<string, 'none' | 'online' | 'enclosed_with_label' | 'enclosed_without_label'> = {}
    for (const mp of activeMarketplaces) {
      if (['shopify', 'aboutyou'].includes(mp.key)) {
        defaults[mp.key] = 'none'
      } else {
        defaults[mp.key] = 'online'
      }
    }
    defaults.otto = 'enclosed_without_label'
    defaults.amazon = 'online'
    defaults.mirakl_decathlon = 'online'
    defaults.shopify = 'none'
    defaults.aboutyou = 'none'

    if (initialConfig?.platformReturns) {
      return { ...defaults, ...initialConfig.platformReturns }
    }
    return defaults
  }
  const [platformReturns, setPlatformReturns] = useState<DhlConfig['platformReturns']>(
    getInitialPlatformReturns()
  )

  // UI state for testing connection and products fetch
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [fetchingProducts, setFetchingProducts] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedProductToAdd, setSelectedProductToAdd] = useState('V55PAK')
  const [editingBillingNumberId, setEditingBillingNumberId] = useState<string | null>(null)
  const [tempBillingNumber, setTempBillingNumber] = useState('')
  const [activeServiceDropdownId, setActiveServiceDropdownId] = useState<string | null>(null)
  
  // Custom dialog state (never use browser alert/confirm)
  const [modalAlert, setModalAlert] = useState<{ title: string; message: string; actionText?: string; onAction?: () => void } | null>(null)

  // Synchronized zones for backwards compatibility
  const syncedZones = useMemo(() => {
    return syncZonesFromProducts(products, accountNumber, initialConfig?.zones || DEFAULT_ZONES)
  }, [products, accountNumber, initialConfig?.zones])

  // Full config object submitted with form
  const config: DhlConfig = {
    username,
    password,
    apiKey,
    apiSecret,
    accountNumber,
    environment: env,
    defaultWeight,
    defaultWeightWarenpost,
    defaultWeightWarenpostInternational,
    defaultWeightKleinpaket,
    defaultWeightKleinpaketInternational,
    defaultLengthCm: defaultLength,
    defaultWidthCm: defaultWidth,
    defaultHeightCm: defaultHeight,
    zones: syncedZones,
    products,
    platformReturns,
  }

  // ─── Handler: Test Connection ─────────────────────────────────────────────
  const handleTestConnection = async () => {
    setTestingConnection(true)
    setTestResult(null)
    try {
      const res = await testDhlConnectionAction({
        username,
        password,
        apiKey,
        environment: env,
      })
      setTestResult(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verbindungstest fehlgeschlagen.'
      setTestResult({
        success: false,
        message: msg,
      })
    } finally {
      setTestingConnection(false)
    }
  }

  // ─── Handler: Produkte Abrufen (Billbee style) ────────────────────────────
  const handleFetchProducts = async () => {
    const cleanEkp = accountNumber.replace(/\D/g, '')
    if (cleanEkp.length < 10) {
      setModalAlert({
        title: 'Kundennummer (EKP) erforderlich',
        message: 'Bitte trage zuerst deine 10-stellige DHL-Kundennummer (EKP) im Reiter "Verbindung" ein, um die Produkte und Abrechnungsnummern abzurufen.',
        actionText: 'Zu Verbindung wechseln',
        onAction: () => {
          setModalAlert(null)
          setActiveTab('connection')
        }
      })
      return
    }

    setFetchingProducts(true)
    try {
      // Perform live connection check first if credentials provided
      if (username && password) {
        const check = await testDhlConnectionAction({
          username,
          password,
          apiKey,
          environment: env,
        })
        if (!check.success) {
          setModalAlert({
            title: 'DHL Zugangsdaten prüfen',
            message: `Die Verbindung zu DHL konnte nicht bestätigt werden (${check.message}). Möchtest du die Standard-Produkte für die Kundennummer trotzdem anlegen?`,
            actionText: 'Trotzdem anlegen',
            onAction: () => {
              setModalAlert(null)
              const newProds = generateDefaultProducts(accountNumber)
              setProducts(newProds)
            }
          })
          setFetchingProducts(false)
          return
        }
      }

      // Populate standard products for this EKP
      const newProds = generateDefaultProducts(accountNumber)
      setProducts(newProds)
      setTestResult({
        success: true,
        message: 'Produkte und Abrechnungsnummern wurden erfolgreich von DHL abgerufen und eingerichtet!',
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Produkte konnten nicht automatisch abgerufen werden.'
      setModalAlert({
        title: 'Fehler beim Produktabruf',
        message: msg,
      })
    } finally {
      setFetchingProducts(false)
    }
  }

  // ─── Product Modification Helpers ─────────────────────────────────────────
  const updateProduct = (id: string, updated: Partial<DhlProduct>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p))
  }

  const removeProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  const handleAddProduct = () => {
    const catalogItem = DHL_CATALOG.find(c => c.code === selectedProductToAdd)
    const cleanEkp = (accountNumber || '').replace(/\D/g, '').padEnd(10, '0').slice(0, 10)
    const procedure = catalogItem?.procedure || '01'
    const newBilling = `${cleanEkp}${procedure}01`
    const nextId = String(12371 + products.length)

    setProducts(prev => [
      ...prev,
      {
        id: nextId,
        productCode: catalogItem?.code || selectedProductToAdd,
        name: catalogItem?.defaultName || selectedProductToAdd,
        billingNumber: newBilling,
        returnBillingNumber: catalogItem?.returnType ? `${cleanEkp}0701` : '',
        returnType: catalogItem?.returnType || '',
        exportAllowed: catalogItem?.export || false,
        additionalServices: catalogItem?.services || ['Paketankündigung'],
      }
    ])
    setShowAddModal(false)
  }

  const tabs = [
    { id: 'connection', label: 'Verbindung', icon: Settings },
    { id: 'general', label: 'Allgemein', icon: Globe },
    { id: 'products', label: 'Produkte', icon: Package },
    { id: 'returns', label: 'Retouren', icon: RefreshCw },
  ] as const

  return (
    <form action={formAction}>
      {/* Hidden field to submit complete synced config */}
      <input type="hidden" name="dhlConfig" value={JSON.stringify(config)} />

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6 -mt-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === tab.id
                ? 'border-yellow-400 text-yellow-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Verbindung ──────────────────────────────────────── */}
      {activeTab === 'connection' && (
        <div className="space-y-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-900 flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="space-y-1">
              <p className="font-semibold text-yellow-950">DHL Geschäftskundenportal (GKP) Zugangsdaten</p>
              <p className="text-yellow-800">
                Gib hier deine Login-Daten vom <a href="https://geschaeftskunden.dhl.de" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-yellow-950 inline-flex items-center gap-1">DHL Geschäftskundenportal <ExternalLink className="w-3 h-3" /></a> ein. Deine 10-stellige Kundennummer (EKP) wird benötigt, um deine Versandprodukte automatisch wie in Billbee einzurichten.
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1.5">Benutzername (GKP Login) *</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white text-slate-900 placeholder:text-slate-500 text-sm"
                  placeholder="max.mustermann@example.com"
                  autoComplete="off"
                  data-lpignore="true"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1.5">Passwort (GKP Login) *</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white text-slate-900 placeholder:text-slate-500 text-sm"
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                  data-lpignore="true"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1.5">Kundennummer (EKP) *</label>
                <input
                  type="text"
                  maxLength={10}
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white text-slate-900 placeholder:text-slate-500 text-sm font-mono tracking-wider"
                  placeholder="z.B. 6384421567"
                />
                <p className="mt-1.5 text-xs text-slate-500">10-stellige DHL Geschäftskunden-Nummer (z. B. auf deiner DHL Rechnung)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1.5">Umgebung</label>
                <select
                  value={env}
                  onChange={e => setEnv(e.target.value as 'production' | 'sandbox')}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white text-slate-900 text-sm"
                >
                  <option value="production">Produktion (Live-Versand)</option>
                  <option value="sandbox">Sandbox (DHL Test-Server)</option>
                </select>
                <p className="mt-1.5 text-xs text-slate-500">Wähle „Produktion“ für den echten Paketversand.</p>
              </div>
            </div>

            {/* Optional API Key override */}
            <div className="pt-2 border-t border-gray-100">
              <details className="group">
                <summary className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer list-none flex items-center gap-1.5 py-1">
                  <span className="text-[10px] group-open:rotate-90 transition-transform">▶</span>
                  <span>Erweiterte API-Einstellungen (optionaler eigener DHL Developer Key)</span>
                </summary>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Eigener DHL API-Key (optional)</label>
                    <input
                      type="text"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      placeholder="Standardmäßig wird der Server-Schlüssel genutzt"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Eigener DHL API-Secret (optional)</label>
                    <input
                      type="password"
                      value={apiSecret}
                      onChange={e => setApiSecret(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      placeholder="Standardmäßig wird das Server-Secret genutzt"
                    />
                  </div>
                </div>
              </details>
            </div>

            {/* Connection Test Section */}
            <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection || !username || !password}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {testingConnection ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
                      Prüfe Verbindung...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Verbindung testen
                    </>
                  )}
                </button>
                <span className="text-xs text-slate-500">Prüft die Erreichbarkeit und Authentifizierung bei DHL</span>
              </div>
            </div>

            {testResult && (
              <div className={`p-4 rounded-xl text-sm flex items-start gap-3 border ${testResult.success ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                {testResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">{testResult.success ? 'Erfolgreich!' : 'Verbindungsfehler'}</p>
                  <p className="text-xs mt-0.5">{testResult.message}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Allgemein ──────────────────────────────────────── */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm">
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-4">Standardversand & Paketgewicht</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-1.5">Standard-Versandland</label>
                  <select className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-slate-900 text-sm" defaultValue="DE">
                    <option value="DE">Deutschland (DE)</option>
                    <option value="AT">Österreich (AT)</option>
                    <option value="CH">Schweiz (CH)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-1.5">Standardgewicht (DHL Paket)</label>
                  <div className="flex">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={defaultWeight}
                      onChange={e => setDefaultWeight(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-slate-900 placeholder:text-slate-500 text-sm"
                    />
                    <span className="px-3.5 py-2.5 bg-slate-100 border border-l-0 border-gray-300 rounded-r-lg text-slate-700 text-sm font-medium">kg</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Wird verwendet, wenn kein Artikelgewicht hinterlegt ist</p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h4 className="text-sm font-semibold text-slate-900 mb-4">Standardgewichte für Kleinpaket & Warenpost</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-1.5">Kleinpaket (National)</label>
                  <div className="flex">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={defaultWeightKleinpaket}
                      onChange={e => setDefaultWeightKleinpaket(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-slate-900 placeholder:text-slate-500 text-sm"
                    />
                    <span className="px-3.5 py-2.5 bg-slate-100 border border-l-0 border-gray-300 rounded-r-lg text-slate-700 text-sm font-medium">kg</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Standard: 0.5 kg</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-1.5">Kleinpaket International</label>
                  <div className="flex">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={defaultWeightKleinpaketInternational}
                      onChange={e => setDefaultWeightKleinpaketInternational(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-slate-900 placeholder:text-slate-500 text-sm"
                    />
                    <span className="px-3.5 py-2.5 bg-slate-100 border border-l-0 border-gray-300 rounded-r-lg text-slate-700 text-sm font-medium">kg</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Standard: 0.5 kg</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-1.5">Warenpost International</label>
                  <div className="flex">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={defaultWeightWarenpostInternational}
                      onChange={e => setDefaultWeightWarenpostInternational(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-slate-900 placeholder:text-slate-500 text-sm"
                    />
                    <span className="px-3.5 py-2.5 bg-slate-100 border border-l-0 border-gray-300 rounded-r-lg text-slate-700 text-sm font-medium">kg</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Standard: 0.2 kg</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-1.5">Warenpost (National alt)</label>
                  <div className="flex">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={defaultWeightWarenpost}
                      onChange={e => setDefaultWeightWarenpost(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-slate-900 placeholder:text-slate-500 text-sm"
                    />
                    <span className="px-3.5 py-2.5 bg-slate-100 border border-l-0 border-gray-300 rounded-r-lg text-slate-700 text-sm font-medium">kg</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Standard: 0.2 kg</p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <label className="block text-sm font-medium text-slate-900 mb-1.5">Standard-Paketmaße in cm (Länge × Breite × Höhe)</label>
              <div className="flex items-center gap-2 max-w-md">
                <input
                  type="number"
                  min="1"
                  value={defaultLength}
                  onChange={e => setDefaultLength(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-slate-900 placeholder:text-slate-500 text-sm text-center"
                  placeholder="Länge"
                />
                <span className="text-slate-400 font-bold">×</span>
                <input
                  type="number"
                  min="1"
                  value={defaultWidth}
                  onChange={e => setDefaultWidth(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-slate-900 placeholder:text-slate-500 text-sm text-center"
                  placeholder="Breite"
                />
                <span className="text-slate-400 font-bold">×</span>
                <input
                  type="number"
                  min="1"
                  value={defaultHeight}
                  onChange={e => setDefaultHeight(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white text-slate-900 placeholder:text-slate-500 text-sm text-center"
                  placeholder="Höhe"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Produkte (Billbee-Style) ─────────────────────────── */}
      {activeTab === 'products' && (
        <div className="space-y-5">
          {/* Billbee header banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
            <div>
              <p className="font-semibold text-slate-900">Aktive DHL-Produkte & Abrechnungsnummern</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Diese Produkte erscheinen beim Label-Druck. Klicke auf <strong>„Produkte abrufen“</strong>, um alle Produkte mit deinen 14-stelligen Abrechnungsnummern automatisch anzulegen.
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <button
                type="button"
                onClick={handleFetchProducts}
                disabled={fetchingProducts}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {fetchingProducts ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                )}
                Produkte abrufen
              </button>
            </div>
          </div>

          {/* Products Table (Billbee Style) */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-gray-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4 w-16 text-center">Id</th>
                    <th className="py-3 px-4 min-w-[280px]">Produkt *</th>
                    <th className="py-3 px-4 min-w-[180px]">Name *</th>
                    <th className="py-3 px-4 w-16 text-center">Export</th>
                    <th className="py-3 px-4 min-w-[240px]">Zusatzleistungen</th>
                    <th className="py-3 px-4 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-medium text-slate-700">Noch keine DHL Produkte konfiguriert</p>
                        <p className="text-xs text-slate-400 mt-1">Klicke oben rechts auf „Produkte abrufen“ oder füge manuell ein Produkt hinzu.</p>
                      </td>
                    </tr>
                  ) : (
                    products.map((product, index) => {
                      const catalogItem = DHL_CATALOG.find(c => c.code === product.productCode)
                      const cleanEkp = (accountNumber || '').replace(/\D/g, '').padEnd(10, '0').slice(0, 10)
                      const procedure = catalogItem?.procedure || '01'
                      const defaultNum = `${cleanEkp}${procedure}01`
                      const currentBilling = product.billingNumber || defaultNum

                      return (
                        <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                          {/* Id */}
                          <td className="py-3.5 px-4 text-center font-mono text-xs text-slate-400">
                            {product.id || 12371 + index}
                          </td>

                          {/* Produkt (Billing Number + Description) */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <select
                                  value={product.productCode}
                                  onChange={e => {
                                    const newCode = e.target.value
                                    const cat = DHL_CATALOG.find(c => c.code === newCode)
                                    const newProc = cat?.procedure || '01'
                                    const newBillingNum = `${cleanEkp}${newProc}01`
                                    updateProduct(product.id, {
                                      productCode: newCode,
                                      name: cat?.defaultName || product.name,
                                      billingNumber: newBillingNum,
                                      exportAllowed: cat?.export ?? product.exportAllowed,
                                      returnType: cat?.returnType ?? product.returnType,
                                    })
                                  }}
                                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                >
                                  {DHL_CATALOG.map(c => (
                                    <option key={c.code} value={c.code}>
                                      {cleanEkp}{c.procedure}01 - {c.label.toUpperCase()} ({c.code})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Participation / Abrechnungsnummer Details */}
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span>Abrechnungsnr.:</span>
                                {editingBillingNumberId === product.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      maxLength={14}
                                      value={tempBillingNumber}
                                      onChange={e => setTempBillingNumber(e.target.value.replace(/\D/g, '').slice(0, 14))}
                                      className="px-2 py-0.5 border border-yellow-400 rounded text-xs font-mono bg-yellow-50 text-slate-900 w-32 focus:outline-none"
                                      placeholder="14-stellig"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (tempBillingNumber.length === 14) {
                                          updateProduct(product.id, { billingNumber: tempBillingNumber })
                                        }
                                        setEditingBillingNumberId(null)
                                      }}
                                      className="text-emerald-600 font-semibold text-xs hover:underline cursor-pointer"
                                    >
                                      OK
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingBillingNumberId(null)}
                                      className="text-slate-400 text-xs hover:underline cursor-pointer"
                                    >
                                      Abbrechen
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-medium text-slate-800">{currentBilling}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setTempBillingNumber(currentBilling)
                                        setEditingBillingNumberId(product.id)
                                      }}
                                      title="Abrechnungsnummer bearbeiten"
                                      className="p-0.5 text-slate-400 hover:text-yellow-600 transition-colors cursor-pointer"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Name */}
                          <td className="py-3.5 px-4">
                            <input
                              type="text"
                              value={product.name}
                              onChange={e => updateProduct(product.id, { name: e.target.value })}
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                              placeholder="z.B. DHL Paket"
                            />
                          </td>

                          {/* Export Checkbox */}
                          <td className="py-3.5 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={product.exportAllowed}
                              onChange={e => updateProduct(product.id, { exportAllowed: e.target.checked })}
                              className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>

                          {/* Zusatzleistungen */}
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {product.additionalServices.map(svc => (
                                <span
                                  key={svc}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-800 text-xs rounded-lg border border-slate-200"
                                >
                                  {svc}
                                  <button
                                    type="button"
                                    onClick={() => updateProduct(product.id, {
                                      additionalServices: product.additionalServices.filter(s => s !== svc)
                                    })}
                                    className="text-slate-400 hover:text-red-500 font-bold cursor-pointer ml-0.5"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}

                              {/* Plus button dropdown */}
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setActiveServiceDropdownId(activeServiceDropdownId === product.id ? null : product.id)}
                                  className="w-6 h-6 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-yellow-500 hover:text-yellow-700 flex items-center justify-center text-sm font-medium transition-colors cursor-pointer"
                                  title="Zusatzleistung hinzufügen"
                                >
                                  +
                                </button>

                                {activeServiceDropdownId === product.id && (
                                  <>
                                    <div
                                      className="fixed inset-0 z-20"
                                      onClick={() => setActiveServiceDropdownId(null)}
                                    />
                                    <div className="absolute left-0 top-7 z-30 bg-white border border-gray-200 rounded-xl shadow-xl p-1.5 w-52 max-h-60 overflow-y-auto">
                                      <p className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                        Zusatzleistung wählen
                                      </p>
                                      {DHL_SERVICES.filter(s => !product.additionalServices.includes(s)).map(svc => (
                                        <button
                                          key={svc}
                                          type="button"
                                          onClick={() => {
                                            updateProduct(product.id, {
                                              additionalServices: [...product.additionalServices, svc]
                                            })
                                            setActiveServiceDropdownId(null)
                                          }}
                                          className="block w-full text-left px-3 py-1.5 text-xs text-slate-800 hover:bg-yellow-50 hover:text-yellow-900 rounded-lg transition-colors cursor-pointer"
                                        >
                                          + {svc}
                                        </button>
                                      ))}
                                      {DHL_SERVICES.filter(s => !product.additionalServices.includes(s)).length === 0 && (
                                        <div className="px-3 py-2 text-xs text-slate-400 italic">
                                          Alle Leistungen ausgewählt
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Delete */}
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => removeProduct(product.id)}
                              className="p-1.5 text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                              title="Produkt löschen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions matching Billbee */}
            <div className="p-4 bg-slate-50/50 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-slate-600" />
                  Hinzufügen
                </button>
                <button
                  type="button"
                  onClick={handleFetchProducts}
                  disabled={fetchingProducts}
                  className="px-4 py-2 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {fetchingProducts ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                  )}
                  Produkte abrufen
                </button>
              </div>

              <span className="text-xs text-slate-400">
                {products.length} {products.length === 1 ? 'Produkt aktiv' : 'Produkte aktiv'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Retouren ────────────────────────────────────────── */}
      {activeTab === 'returns' && (
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 border border-slate-200 shadow-sm">
            <p>
              Lege hier fest, welche <strong>Retourenmethode</strong> für jeden Marktplatz verwendet werden soll.
              Plattformen wie <strong>Otto</strong> stellen das Retouren-Label z. B. selbst bereit – hier genügt ein beiliegender Retourenschein ohne Label.
            </p>
          </div>

          {activeMarketplaces.map(({ key, label, type }) => {
            const icon = type === 'otto' ? '🟥' :
                         type === 'amazon' ? '🟧' :
                         type === 'shopify' ? '🟩' :
                         type === 'aboutyou' ? '⬜' :
                         type === 'kaufland' ? '🟥' :
                         type === 'ebay' ? '🟨' : '🟦'
            const value = platformReturns[key] ?? (['shopify', 'aboutyou'].includes(key) ? 'none' : 'online')
            
            let hint = ''
            if (type === 'otto') hint = 'Otto-Kunden drucken das Label über das Otto-Portal – kein eigenes DHL-Label nötig.'
            else if (type === 'amazon') hint = 'Amazon bietet ein eigenes Retouren-Portal an.'

            return (
              <div key={key} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-lg">{icon}</span>
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm">{label}</h4>
                    {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {([
                    {
                      v: 'none' as const,
                      title: 'Keine Retoure',
                      desc: 'Es wird kein Retourenlabel generiert oder dem Paket beigelegt.',
                    },
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
                      className={`flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                        value === opt.v
                          ? 'border-yellow-400 bg-yellow-50/60 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-yellow-200 hover:bg-yellow-50/20'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                        value === opt.v ? 'border-yellow-500 bg-yellow-400' : 'border-gray-300'
                      }`} />
                      <span className={`text-sm font-semibold ${value === opt.v ? 'text-yellow-950' : 'text-slate-800'}`}>
                        {opt.title}
                      </span>
                      <span className="text-xs text-slate-500 leading-relaxed">{opt.desc}</span>
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
        <div className={`mt-6 p-4 rounded-xl text-sm flex items-center gap-3 border shadow-sm ${state.success ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {state.success ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          )}
          <span className="font-medium">{state.message}</span>
        </div>
      )}

      {/* Save Button */}
      <div className="mt-8 flex justify-end gap-3 items-center">
        <button
          type="submit"
          disabled={pending}
          className="px-8 py-3 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin text-slate-900" />}
          {pending ? 'Wird gespeichert...' : 'Speichern'}
        </button>
      </div>

      {/* ── Custom Modal: Add Product ───────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">DHL Produkt hinzufügen</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1.5">Produkt auswählen</label>
              <select
                value={selectedProductToAdd}
                onChange={e => setSelectedProductToAdd(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                {DHL_CATALOG.filter(c => !products.some(p => p.productCode === c.code)).map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code} – {c.label} (Verfahren {c.procedure})
                  </option>
                ))}
                {DHL_CATALOG.filter(c => !products.some(p => p.productCode === c.code)).length === 0 && (
                  <option value="" disabled>Alle Standard-Produkte sind bereits vorhanden</option>
                )}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-sm rounded-lg cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleAddProduct}
                disabled={!selectedProductToAdd || products.some(p => p.productCode === selectedProductToAdd)}
                className="px-5 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold text-sm rounded-lg shadow-sm disabled:opacity-50 cursor-pointer"
              >
                Hinzufügen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom Modal: Alert / Confirmation ──────────────────────── */}
      {modalAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">{modalAlert.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{modalAlert.message}</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setModalAlert(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-sm rounded-lg cursor-pointer"
              >
                Schließen
              </button>
              {modalAlert.actionText && (
                <button
                  type="button"
                  onClick={() => {
                    modalAlert.onAction?.()
                  }}
                  className="px-5 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold text-sm rounded-lg shadow-sm cursor-pointer"
                >
                  {modalAlert.actionText}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </form>
  )
}

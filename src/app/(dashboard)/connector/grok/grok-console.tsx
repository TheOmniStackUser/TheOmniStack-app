'use client'

import { useState } from 'react'
import { generateApiKeyAction } from '@/app/actions/api-keys'
import { ConfirmModal } from '@/components/confirm-modal'
import { AlertModal } from '@/components/alert-modal'
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  Terminal,
  Play,
  RotateCw,
  ExternalLink,
  Bot,
  Zap,
  ShieldCheck,
  Layers,
  ArrowRight,
  Lock,
  KeyRound,
} from 'lucide-react'

interface GrokConsoleProps {
  initialApiKey: string | null
  baseUrl: string
  companyName: string
  toolsManifest: Array<{
    name: string
    description: string
    category: string
    parameters: any
  }>
}

const SAMPLE_PAYLOADS: Record<string, any> = {
  get_analytics_summary: {},
  get_system_health: {},
  list_orders: { limit: 10, status: 'pending' },
  get_order_details: { orderId: 'REPLACE_WITH_ORDER_ID' },
  update_order_status: { orderId: 'REPLACE_WITH_ORDER_ID', status: 'processing' },
  update_order_notes: { orderId: 'REPLACE_WITH_ORDER_ID', notes: 'Priority parcel requested by customer' },
  generate_order_delivery_note: { orderId: 'REPLACE_WITH_ORDER_ID' },
  generate_order_invoice: { orderId: 'REPLACE_WITH_ORDER_ID', customText: 'Thank you for your business!' },
  generate_shipping_label: { orderId: 'REPLACE_WITH_ORDER_ID', carrier: 'dhl', weightKg: 1.5 },
  cancel_order: { orderId: 'REPLACE_WITH_ORDER_ID', reason: 'Customer requested cancellation' },
  list_invoices: { limit: 10 },
  get_invoice_details: { invoiceId: 'REPLACE_WITH_INVOICE_ID' },
  cancel_invoice: { invoiceId: 'REPLACE_WITH_INVOICE_ID', reason: 'Billing address correction' },
  mark_invoice_as_paid: { invoiceId: 'REPLACE_WITH_INVOICE_ID', paymentMethod: 'Banküberweisung' },
  generate_missing_invoices: { maxCount: 10 },
  list_products: { limit: 10, lowStockOnly: false },
  get_product_details: { identifier: 'REPLACE_WITH_SKU_OR_ID' },
  adjust_stock: { identifier: 'REPLACE_WITH_SKU', newStock: 50 },
  create_product: { sku: 'TEST-SKU-100', title: 'Sample Product', price: 29.99, currentStock: 25 },
  trigger_inventory_sync: {},
  list_unmapped_listings: { limit: 10, isBlocked: false },
  get_unmapped_listing_details: { identifier: 'REPLACE_WITH_UNMAPPED_ID_OR_SKU' },
  map_unmapped_listing: { unmappedId: 'REPLACE_WITH_UNMAPPED_ID', productId: 'REPLACE_WITH_PRODUCT_ID_OR_SKU', syncStock: true },
  create_and_map_product: { unmappedId: 'REPLACE_WITH_UNMAPPED_ID' },
  auto_map_unmapped_listings: { dryRun: true },
  list_product_mappings: { limit: 10 },
  set_product_mapping: { productId: 'REPLACE_WITH_PRODUCT_ID_OR_SKU', marketplace: 'otto', marketplaceSku: 'SKU-123', syncStock: true },
  delete_product_mapping: { mappingId: 'REPLACE_WITH_MAPPING_ID', restoreToUnmapped: true },
  list_returns: { limit: 10 },
  get_return_details: { returnId: 'REPLACE_WITH_RETURN_ID' },
  register_return: {
    orderNumber: 'ORDER-12345',
    customerName: 'Max Mustermann',
    status: 'neu',
    items: [{ skuOrProductName: 'SKU-ABC', quantity: 1, condition: 'new' }],
  },
  update_return_status: { returnId: 'REPLACE_WITH_RETURN_ID', status: 'geprueft' },
  list_customers: { limit: 10 },
  get_customer_details: { customerId: 'REPLACE_WITH_CUSTOMER_ID' },
  list_integrations: {},
  trigger_marketplace_sync: { marketplace: 'all' },
}

export function GrokConsole({
  initialApiKey,
  baseUrl,
  companyName,
  toolsManifest,
}: GrokConsoleProps) {
  const [apiKey, setApiKey] = useState<string | null>(initialApiKey)
  const [showKey, setShowKey] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  // Modals
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')
  const [alertTitle, setAlertTitle] = useState('')

  // Playground state
  const [selectedTool, setSelectedTool] = useState(toolsManifest[0]?.name || 'get_analytics_summary')
  const [jsonParams, setJsonParams] = useState(
    JSON.stringify(SAMPLE_PAYLOADS[toolsManifest[0]?.name || 'get_analytics_summary'] || {}, null, 2)
  )
  const [executing, setExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<any | null>(null)
  const [executionTime, setExecutionTime] = useState<number | null>(null)

  // Catalog category filter
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchFilter, setSearchFilter] = useState('')

  const openApiJsonUrl = `${baseUrl}/api/connector/grok/openapi.json`
  const openApiYamlUrl = `${baseUrl}/api/connector/grok/openapi.yaml`
  const mcpUrl = `${baseUrl}/api/connector/grok/mcp`
  const executeUrl = `${baseUrl}/api/connector/grok/execute`

  const grokSystemPrompt = `You are OmniStack AI, the autonomous e-commerce operations manager for ${companyName} on TheOmniStack platform.
You have access to the complete TheOmniStack Grok Bot Connector API.

Your capabilities include:
1. ORDER MANAGEMENT: Searching orders, checking status, fetching shipping details, updating order status, cancelling orders, and assigning delivery notes.
2. BILLING & INVOICING: Issuing GoBD-compliant PDF invoices, retrieving invoice lines, cancelling invoices via credit notes (Storno), recording payments, and batch generating missing invoices.
3. WAREHOUSE, INVENTORY (WAWI) & MAPPINGS: Listing products, checking inventory, adjusting warehouse stock, listing unmapped marketplace listings (Otto, Amazon, Shopify, Mirakl, eBay), creating central products directly from unmapped listings, mapping listings to central products, running automated batch mapping via SKU/EAN, and managing product mappings.
4. RETURNS MANAGEMENT: Scanning incoming returns, inspecting item condition (new, used, damaged, defect), and executing automated refunds through marketplace channels.
5. LOGISTICS & CARRIERS: Generating shipping labels for DHL, Hermes, and DPD, and retrieving live tracking numbers.
6. REAL-TIME INTELLIGENCE: Providing instant analytics on sales revenue, pending fulfillment counts, return rates, and low-stock alerts.

Operating Guidelines:
- Base URL: ${baseUrl}
- Connector endpoint: ${baseUrl}/api/connector/grok/execute
- Authentication: Handled securely via the Grok Action Vault (Bearer Auth). Never output, request, or expose raw API keys in conversation prompts.

Always confirm destructive operations (cancelling an order, cancelling an invoice, or issuing a refund) before execution, and provide clear structured summaries of any actions performed.`

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text)
    if (type === 'key') {
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    } else if (type === 'prompt') {
      setCopiedPrompt(true)
      setTimeout(() => setCopiedPrompt(false), 2000)
    } else {
      setCopiedUrl(type)
      setTimeout(() => setCopiedUrl(null), 2000)
    }
  }

  const handleGenerateKey = async () => {
    try {
      const newKey = await generateApiKeyAction()
      setApiKey(newKey)
      setAlertTitle('API-Key erneuert')
      setAlertMessage('Ein neuer API-Key wurde erfolgreich generiert. Der alte Key ist ab sofort ungültig.')
      setAlertOpen(true)
    } catch (err: any) {
      setAlertTitle('Fehler')
      setAlertMessage(err?.message || 'Der API-Key konnte nicht generiert werden.')
      setAlertOpen(true)
    }
  }

  const handleSelectTool = (name: string) => {
    setSelectedTool(name)
    const payload = SAMPLE_PAYLOADS[name] || {}
    setJsonParams(JSON.stringify(payload, null, 2))
  }

  const handleExecutePlayground = async () => {
    if (!apiKey) {
      setAlertTitle('API-Key erforderlich')
      setAlertMessage('Bitte generiere zuerst einen API-Key, um Aktionen im Playground auszuführen.')
      setAlertOpen(true)
      return
    }

    let parsedParams = {}
    try {
      parsedParams = jsonParams.trim() ? JSON.parse(jsonParams) : {}
    } catch {
      setAlertTitle('Ungültiges JSON')
      setAlertMessage('Die eingegebenen Parameter enthalten kein gültiges JSON. Bitte Syntax prüfen.')
      setAlertOpen(true)
      return
    }

    setExecuting(true)
    setExecutionResult(null)
    const startTime = performance.now()

    try {
      const res = await fetch('/api/connector/grok/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          tool: selectedTool,
          parameters: parsedParams,
        }),
      })

      const json = await res.json()
      const duration = Math.round(performance.now() - startTime)
      setExecutionTime(duration)
      setExecutionResult({
        status: res.status,
        ok: res.ok,
        body: json,
      })
    } catch (err: any) {
      const duration = Math.round(performance.now() - startTime)
      setExecutionTime(duration)
      setExecutionResult({
        status: 500,
        ok: false,
        body: { error: err.message || 'Verbindung fehlgeschlagen' },
      })
    } finally {
      setExecuting(false)
    }
  }

  const filteredManifest = toolsManifest.filter((t) => {
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory
    const matchesSearch =
      !searchFilter ||
      t.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      t.description.toLowerCase().includes(searchFilter.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div className="space-y-8 pb-16">
      {/* Modals */}
      <ConfirmModal
        isOpen={confirmRegenOpen}
        onClose={() => setConfirmRegenOpen(false)}
        onConfirm={handleGenerateKey}
        title="Neuen API-Key generieren?"
        message="Achtung: Durch das Erstellen eines neuen Keys wird dein bisheriger Key sofort ungültig. Grok Bot und externe Anbindungen müssen mit dem neuen Key aktualisiert werden."
        confirmText="Neuen Key erstellen"
        isDestructive={true}
      />

      <AlertModal
        isOpen={alertOpen}
        onClose={() => setAlertOpen(false)}
        title={alertTitle}
        message={alertMessage}
      />

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-950 p-8 text-white shadow-xl border border-cyan-500/20">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 text-xs font-semibold uppercase tracking-wider">
              <Bot className="w-3.5 h-3.5" />
              xAI Grok Bot Connector
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              TheOmniStack Connector für Grok Bot
            </h1>
            <p className="text-slate-300 text-sm max-w-2xl leading-relaxed">
              Vollständige Anbindung für Grok Bot und autonome xAI-Agenten. Ermöglicht Grok die eigenständige
              Steuerung aller OmniStack-Funktionen: Bestellungen, GoBD-Rechnungen, Lagerbestände, Retourenprüfung,
              Versandlabels und Live-Analysen.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <a
              href="/api/connector/grok/openapi.json"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm transition-all border border-white/10 shadow-sm"
            >
              <ExternalLink className="w-4 h-4 text-cyan-400" />
              OpenAPI JSON
            </a>
            <a
              href="/api/connector/grok/openapi.yaml"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition-all shadow-[0_0_20px_rgba(34,211,238,0.4)]"
            >
              <ExternalLink className="w-4 h-4" />
              OpenAPI YAML
            </a>
          </div>
        </div>

        {/* Ambient background glow */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Grid: Credentials & Connection URLs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* API Key Box */}
        <div className="lg:col-span-1 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-cyan-50 flex items-center justify-center border border-cyan-100">
                <KeyRound className="w-5 h-5 text-cyan-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Grok Connector API-Key</h3>
                <p className="text-xs text-slate-500">Für den Grok Action Vault</p>
              </div>
            </div>
            {apiKey && (
              <button
                onClick={() => setConfirmRegenOpen(true)}
                className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 cursor-pointer"
              >
                Erneuern
              </button>
            )}
          </div>

          {apiKey ? (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Dein API-Token (für den Vault)</label>
              <div className="flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  readOnly
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 font-mono text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
                  title={showKey ? 'Verbergen' : 'Anzeigen'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(apiKey, 'key')}
                  className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
                  title="Kopieren"
                >
                  {copiedKey ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200/80 text-[11px] text-amber-800 flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Wichtig:</strong> Dieser Key gehört <u>nicht</u> in den Prompt! Trage ihn in xAI / Grok im geschützten <strong>Action Auth Vault</strong> als Bearer Token ein.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Es wurde noch kein persönlicher API-Key für diesen Account generiert. Klicke unten, um deinen Key für den Grok Action Vault zu erstellen.
              </p>
              <button
                onClick={handleGenerateKey}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-cyan-400" />
                API-Key jetzt generieren
              </button>
            </div>
          )}
        </div>

        {/* Protocol Endpoints Box */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
              <Zap className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Verbindungsendpunkte für Grok</h3>
              <p className="text-xs text-slate-500">1-Klick Setup für Grok Actions, Plugins und MCP Clients</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* OpenAPI JSON */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>OpenAPI 3.1 Schema (JSON)</span>
                <button
                  onClick={() => handleCopy(openApiJsonUrl, 'openapi_json')}
                  className="text-cyan-600 hover:text-cyan-700 flex items-center gap-1 font-bold cursor-pointer"
                >
                  {copiedUrl === 'openapi_json' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedUrl === 'openapi_json' ? 'Kopiert' : 'Kopieren'}
                </button>
              </div>
              <p className="text-[11px] font-mono text-slate-600 truncate">{openApiJsonUrl}</p>
            </div>

            {/* MCP Endpoint */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Model Context Protocol (MCP)</span>
                <button
                  onClick={() => handleCopy(mcpUrl, 'mcp')}
                  className="text-cyan-600 hover:text-cyan-700 flex items-center gap-1 font-bold cursor-pointer"
                >
                  {copiedUrl === 'mcp' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedUrl === 'mcp' ? 'Kopiert' : 'Kopieren'}
                </button>
              </div>
              <p className="text-[11px] font-mono text-slate-600 truncate">{mcpUrl}</p>
            </div>

            {/* Universal Executor */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Universal Tool Dispatcher</span>
                <button
                  onClick={() => handleCopy(executeUrl, 'execute')}
                  className="text-cyan-600 hover:text-cyan-700 flex items-center gap-1 font-bold cursor-pointer"
                >
                  {copiedUrl === 'execute' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedUrl === 'execute' ? 'Kopiert' : 'Kopieren'}
                </button>
              </div>
              <p className="text-[11px] font-mono text-slate-600 truncate">{executeUrl}</p>
            </div>

            {/* Base URL */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Base Server URL</span>
                <button
                  onClick={() => handleCopy(baseUrl, 'base')}
                  className="text-cyan-600 hover:text-cyan-700 flex items-center gap-1 font-bold cursor-pointer"
                >
                  {copiedUrl === 'base' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedUrl === 'base' ? 'Kopiert' : 'Kopieren'}
                </button>
              </div>
              <p className="text-[11px] font-mono text-slate-600 truncate">{baseUrl}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Grok Action Vault Setup Guide */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-950 rounded-2xl p-6 text-white border border-cyan-500/30 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 flex items-center justify-center border border-cyan-400/30">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Sicheres Grok Action Vault Setup</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Zero Secrets im Prompt
                </span>
              </div>
              <p className="text-xs text-slate-300">
                So verbindest du Grok sicher, ohne deinen geheimen API-Schlüssel im Chat-Prompt preiszugeben
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1.5">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-[11px] border border-cyan-500/30">1</span>
              API-Key generieren
            </div>
            <p className="text-[11px] text-slate-300 leading-normal">
              Erstelle oben deinen persönlichen Connector-Key. Der Schlüssel wird verschlüsselt gespeichert und gehört ausschließlich in den Grok-Tresor.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1.5">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-[11px] border border-cyan-500/30">2</span>
              OpenAPI hinterlegen
            </div>
            <p className="text-[11px] text-slate-300 leading-normal">
              Erstelle in Grok / xAI eine neue Action und füge die Schema-URL (<code className="text-cyan-300 font-mono text-[10px]">openapi.json</code> oder YAML) ein.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1.5">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-[11px] border border-cyan-500/30">3</span>
              Im Vault speichern
            </div>
            <p className="text-[11px] text-slate-300 leading-normal">
              Wähle bei <strong>Authentication</strong> den Typ <strong>API Key</strong> &rarr; <strong>Bearer Token</strong> und trage den Key dort ein. Niemals im Prompt!
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1.5">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-[11px] border border-cyan-500/30">4</span>
              Prompt einfügen
            </div>
            <p className="text-[11px] text-slate-300 leading-normal">
              Kopiere den sauberen System-Prompt unten in die Anweisungen des Bots. Grok authentifiziert sich automatisch im Hintergrund über den Vault.
            </p>
          </div>
        </div>
      </div>

      {/* Grok Bot System Prompt Template */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-100">
              <Sparkles className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Grok Bot Anweisungen & Persona (Prompt)</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Zero Secrets (Vault-Ready)
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Diesen Prompt direkt in den Custom Grok Bot auf xAI einfügen, damit Grok seine Aufgaben versteht
              </p>
            </div>
          </div>
          <button
            onClick={() => handleCopy(grokSystemPrompt, 'prompt')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm self-start sm:self-auto"
          >
            {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedPrompt ? 'Prompt kopiert!' : 'Prompt kopieren'}
          </button>
        </div>

        <textarea
          readOnly
          value={grokSystemPrompt}
          rows={6}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-900 font-mono text-xs text-cyan-300 placeholder:text-slate-500 leading-relaxed focus:outline-none resize-none select-all"
        />
      </div>

      {/* Interactive Tool Playground */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
              <Terminal className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Interaktiver Grok Tool Playground</h3>
              <p className="text-xs text-slate-500">
                Führe beliebige Tools direkt im Browser aus, um die Antwort von TheOmniStack live zu testen
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedTool}
              onChange={(e) => handleSelectTool(e.target.value)}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer"
            >
              {toolsManifest.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({t.category})
                </option>
              ))}
            </select>

            <button
              onClick={handleExecutePlayground}
              disabled={executing}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {executing ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              {executing ? 'Ausführen...' : 'Tool ausführen'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Left: Input Payload */}
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Parameter (JSON Payload)
              </span>
              <button
                onClick={() => handleSelectTool(selectedTool)}
                className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Vorlage zurücksetzen
              </button>
            </div>
            <textarea
              value={jsonParams}
              onChange={(e) => setJsonParams(e.target.value)}
              rows={12}
              className="w-full p-3.5 rounded-xl border border-slate-300 bg-white font-mono text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-y leading-relaxed"
              placeholder="{}"
            />
            <p className="text-[11px] text-slate-500">
              Beschreibung:{' '}
              <span className="font-medium text-slate-700">
                {toolsManifest.find((t) => t.name === selectedTool)?.description}
              </span>
            </p>
          </div>

          {/* Right: Live Result */}
          <div className="p-6 space-y-3 bg-slate-900 text-slate-100 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  Antwort von TheOmniStack
                  {executionTime !== null && (
                    <span className="text-[10px] font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                      {executionTime} ms
                    </span>
                  )}
                </span>
                {executionResult && (
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      executionResult.ok
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    HTTP {executionResult.status} {executionResult.ok ? 'SUCCESS' : 'ERROR'}
                  </span>
                )}
              </div>

              <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 font-mono text-xs overflow-auto max-h-[290px] leading-relaxed select-all">
                {executionResult ? (
                  <pre className="text-cyan-300 whitespace-pre-wrap">
                    {JSON.stringify(executionResult.body, null, 2)}
                  </pre>
                ) : (
                  <div className="text-slate-500 italic py-12 text-center">
                    Klicke oben auf &quot;Tool ausführen&quot;, um eine Anfrage an TheOmniStack zu senden.
                  </div>
                )}
              </div>
            </div>

            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800 flex items-center justify-between">
              <span>Endpoint: POST /api/connector/grok/execute</span>
              <span>Tenant: {companyName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tool Manifest Reference Catalog */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-50 flex items-center justify-center border border-cyan-100">
              <Layers className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Verfügbare Tools & Schnittstellen ({toolsManifest.length})</h3>
              <p className="text-xs text-slate-500">
                Vollständige Übersicht aller Aktionen, die Grok Bot mit dem Connector ausführen kann
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Tools filtern..."
              className="px-3.5 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {['all', 'orders', 'invoices', 'products', 'returns', 'customers', 'integrations', 'shipping', 'analytics'].map(
            (cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat === 'all' ? 'Alle Tools' : cat}
              </button>
            )
          )}
        </div>

        {/* Tools List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredManifest.map((tool) => (
            <div
              key={tool.name}
              className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-cyan-300 hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    {tool.category}
                  </span>
                  <button
                    onClick={() => {
                      handleSelectTool(tool.name)
                      window.scrollTo({ top: 400, behavior: 'smooth' })
                    }}
                    className="text-xs text-cyan-600 hover:text-cyan-700 font-bold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    Im Playground testen
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <h4 className="font-mono text-xs font-bold text-slate-900">{tool.name}</h4>
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{tool.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  Parameter:{' '}
                  {tool.parameters?.properties ? Object.keys(tool.parameters.properties).length : 0}
                </span>
                {tool.parameters?.required && (
                  <span className="text-amber-600 font-medium">
                    {tool.parameters.required.length} Pflichtfeld(er)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

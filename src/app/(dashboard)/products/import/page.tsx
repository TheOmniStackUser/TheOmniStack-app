import { requireAuth } from '@/lib/session'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, Layers, Plus, Link as LinkIcon, Database } from 'lucide-react'

export const metadata = {
  title: 'Import & Mapping - Produkte',
}

export default async function ProductImportPage() {
  await requireAuth()

  // Placeholder for unmapped products fetched from DB or directly from adapter
  const unmappedProducts = [
    { id: '1', marketplace: 'shopify', sku: 'TSHIRT-RED-M', title: 'Basic T-Shirt Rot M', price: '19.99', stock: 12 },
    { id: '2', marketplace: 'otto', sku: 'TSHIRT-RED-M-OTTO', title: 'T-Shirt Basic Rot (Größe M)', price: '21.99', stock: 12 },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <Link href="/products" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-2">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Zurück zur Übersicht
          </Link>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Layers className="w-6 h-6" />
            </div>
            Import & Mapping
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Verknüpfen Sie neue Marktplatz-Artikel mit Ihrem zentralen Bestand.</p>
        </div>

        <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 shadow-md hover:shadow-lg transition-all duration-300">
          <RefreshCw className="w-4 h-4" />
          Märkte synchronisieren
        </button>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-slate-400" />
            Ungemappte Marktplatz-Produkte
          </h2>
          <p className="text-sm text-slate-500 mt-1">Diese Artikel wurden auf angebundenen Marktplätzen gefunden, sind aber noch keinem Stammprodukt zugewiesen.</p>
        </div>

        <div className="divide-y divide-slate-100">
          {unmappedProducts.map((p) => (
            <div key={p.id} className="p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 hover:bg-slate-50/30 transition-colors">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-md uppercase tracking-wider">
                    {p.marketplace}
                  </span>
                  <span className="font-mono text-sm font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    {p.sku}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">{p.title}</h3>
                <div className="flex gap-4 mt-2 text-sm text-slate-500 font-medium">
                  <span>Preis: {p.price} €</span>
                  <span>Bestand: {p.stock}</span>
                </div>
              </div>

              <div className="flex gap-3 w-full lg:w-auto">
                <button className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all font-semibold shadow-sm">
                  <LinkIcon className="w-4 h-4" />
                  Mappen
                </button>
                <button className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg hover:from-emerald-400 hover:to-teal-400 transition-all font-semibold shadow-sm">
                  <Plus className="w-4 h-4" />
                  Als Neu anlegen
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

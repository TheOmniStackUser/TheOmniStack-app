import Link from 'next/link'
import { Bot, Sparkles, ArrowRight } from 'lucide-react'
import { ApiSettings } from './api-settings'

export default function MobileAppPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mobile App & API</h1>
        <p className="text-gray-500 mt-1">Verwalte den Zugriff für die mobile OmniScan App und externe KI-Agenten.</p>
      </div>
      
      <ApiSettings />

      {/* Grok Bot Connector Highlight Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950 text-white border border-cyan-500/30 shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-bold uppercase tracking-wider border border-cyan-500/30">
              <Bot className="w-3.5 h-3.5 text-cyan-400" />
              KI-Connector & Agenten
            </div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              xAI Grok Bot Connector
              <Sparkles className="w-4 h-4 text-cyan-400" />
            </h3>
            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
              Verbinde deinen Grok Bot direkt mit TheOmniStack via OpenAPI 3.1 & MCP. Grok kann Bestellungen, Rechnungen,
              Warenwirtschaft, Retouren und DHL-Labels vollautomatisch steuern.
            </p>
          </div>
          <Link
            href="/connector/grok"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition-all whitespace-nowrap self-start sm:self-auto"
          >
            Grok Connector öffnen
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

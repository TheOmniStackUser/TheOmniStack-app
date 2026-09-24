'use client'

import { useState } from 'react'
import { ProductSyncLog } from '@/db/schema/products'
import { format } from 'date-fns'
import { CheckCircle2, XCircle, AlertTriangle, Search, X, Loader2, Info } from 'lucide-react'

type LogsClientProps = {
  initialLogs: ProductSyncLog[]
}

export function LogsClient({ initialLogs }: LogsClientProps) {
  const [logs, setLogs] = useState(initialLogs)
  const [search, setSearch] = useState('')
  const [selectedLog, setSelectedLog] = useState<ProductSyncLog | null>(null)

  const [selectedMarketplace, setSelectedMarketplace] = useState<string>('')

  // Get unique marketplaces
  const marketplaces = Array.from(new Set(logs.map(log => log.marketplace))).sort()

  const filteredLogs = logs.filter(log => {
    const s = search.toLowerCase()
    const matchesSearch = log.marketplace.toLowerCase().includes(s) || 
                          (log.errorMessage || '').toLowerCase().includes(s) ||
                          (log.id).includes(s)
    const matchesMarketplace = selectedMarketplace === '' || log.marketplace === selectedMarketplace
    
    return matchesSearch && matchesMarketplace
  })

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50/50">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Suchen (Marktplatz, Fehler)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-slate-900 placeholder:text-slate-500"
            />
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <select
              value={selectedMarketplace}
              onChange={(e) => setSelectedMarketplace(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-slate-700"
            >
              <option value="">Alle Marktplätze</option>
              {marketplaces.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            
            <div className="relative group flex items-center justify-center sm:justify-start text-sm font-medium text-slate-600 bg-white px-4 py-2 rounded-xl border border-slate-200 cursor-help w-full sm:w-auto">
              <span>{filteredLogs.length} Einträge</span>
              <div className="ml-2 bg-slate-100 p-1 rounded-full text-slate-400 group-hover:bg-cyan-50 group-hover:text-cyan-500 transition-colors">
                <Info className="w-3.5 h-3.5" />
              </div>
              
              <div className="absolute right-0 sm:-right-2 top-full mt-2 w-64 p-3 bg-slate-800 text-slate-50 text-xs leading-relaxed rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-lg shadow-slate-200/50">
                <div className="absolute -top-1 right-8 w-2 h-2 bg-slate-800 rotate-45"></div>
                Aus Performance- und Speichergründen werden die Sync-Logs automatisch nach 30 Tagen aus der Datenbank gelöscht.
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Datum</th>
                <th className="px-6 py-4">Marktplatz</th>
                <th className="px-6 py-4">Aktualisierte Produkte</th>
                <th className="px-6 py-4 w-full">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    Keine Sync-Logs gefunden.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr 
                    key={log.id} 
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="px-6 py-4">
                      {log.status === 'success' ? (
                        <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md w-fit font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          Erfolg
                        </div>
                      ) : log.status === 'error' ? (
                        <div className="flex items-center gap-2 text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md w-fit font-medium">
                          <XCircle className="w-4 h-4" />
                          Fehler
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md w-fit font-medium">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Laufend
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {format(new Date(log.startedAt), 'dd.MM.yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {log.marketplace}
                    </td>
                    <td className="px-6 py-4">
                      {log.totalUpdates} Produkte
                    </td>
                    <td className="px-6 py-4 text-slate-500 truncate max-w-[200px]">
                      {log.errorMessage ? (
                        <span className="text-rose-600 font-medium">{log.errorMessage}</span>
                      ) : (
                        'Details ansehen'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900">
                Sync-Details: {selectedLog.marketplace}
              </h2>
              <button 
                onClick={() => setSelectedLog(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <div className="text-sm font-medium text-slate-500 mb-1">Status</div>
                  <div className="font-semibold text-slate-900">
                    {selectedLog.status === 'success' ? 'Erfolgreich' : selectedLog.status === 'error' ? 'Fehler' : 'Laufend'}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <div className="text-sm font-medium text-slate-500 mb-1">Gestartet am</div>
                  <div className="font-semibold text-slate-900">
                    {format(new Date(selectedLog.startedAt), 'dd.MM.yyyy HH:mm:ss')}
                  </div>
                </div>
              </div>

              {selectedLog.errorMessage && (
                <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-900">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-rose-800 mb-1">Fehlermeldung</div>
                    <div className="text-sm">{selectedLog.errorMessage}</div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-blue-50/50">
                  <Info className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium text-blue-800">
                    Gesendete Produktdaten ({selectedLog.totalUpdates})
                  </span>
                </div>
                
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">SKU</th>
                        <th className="px-4 py-3 font-semibold">Bestand</th>
                        <th className="px-4 py-3 font-semibold">Normaler Preis</th>
                        <th className="px-4 py-3 font-semibold">Aktionspreis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Array.isArray(selectedLog.syncedSkus) && selectedLog.syncedSkus.length > 0 ? (
                        selectedLog.syncedSkus.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-900">{item.sku}</td>
                            <td className="px-4 py-3 text-slate-600">
                              {item.stock !== undefined ? (
                                <span className="bg-slate-100 px-2 py-1 rounded text-slate-700 font-medium">
                                  {item.stock}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Nicht gesynct</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {item.price !== undefined ? (
                                <span className="bg-slate-100 px-2 py-1 rounded text-slate-700 font-medium">
                                  {Number(item.price).toFixed(2)} €
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {item.reducedPrice !== undefined && item.reducedPrice > 0 ? (
                                <div>
                                  <span className="bg-rose-50 text-rose-700 px-2 py-1 rounded font-medium border border-rose-100">
                                    {Number(item.reducedPrice).toFixed(2)} €
                                  </span>
                                  {(item.saleStartDate || item.saleEndDate) && (
                                    <div className="text-[10px] text-slate-500 mt-1.5 whitespace-nowrap">
                                      {item.saleStartDate ? format(new Date(item.saleStartDate), 'dd.MM.yy') : '∞'} - {item.saleEndDate ? format(new Date(item.saleEndDate), 'dd.MM.yy') : '∞'}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                            Keine Produktdetails verfügbar.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  )
}

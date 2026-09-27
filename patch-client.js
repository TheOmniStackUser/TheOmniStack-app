const fs = require('fs')

const file = 'src/app/(dashboard)/products/products-client.tsx'
let content = fs.readFileSync(file, 'utf8')

// 1. Imports
if(!content.includes('GitMerge')) {
  content = content.replace("Package, Search, ChevronUp, ChevronDown, ChevronRight, Scale, MapPin, Tag, FileText, Barcode, ExternalLink, Trash2, Building2, X, Loader2, Copy, MoreHorizontal", "Package, Search, ChevronUp, ChevronDown, ChevronRight, Scale, MapPin, Tag, FileText, Barcode, ExternalLink, Trash2, Building2, X, Loader2, Copy, MoreHorizontal, GitMerge, CheckCircle2")
}
if(!content.includes('mergeProductsAction')) {
  content = content.replace("deleteProductAction, updateProductAction", "deleteProductAction, updateProductAction, mergeProductsAction")
}

// 2. State
if(!content.includes('showMergeModal')) {
  content = content.replace("const [showBulkCustomsModal, setShowBulkCustomsModal] = useState(false)", "const [showBulkCustomsModal, setShowBulkCustomsModal] = useState(false)\n  const [showMergeModal, setShowMergeModal] = useState(false)")
}

// 3. Button
const bulkCustomsBtn = `            <button
              onClick={() => setShowBulkCustomsModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-sm font-semibold border border-indigo-200"
            >
              <FileText className="w-4 h-4" />
              Zolldaten setzen
            </button>`

const mergeBtn = `
            {selectedIds.length === 2 && (
              <button
                onClick={() => setShowMergeModal(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors text-sm font-semibold border border-purple-200"
              >
                <GitMerge className="w-4 h-4" />
                Zusammenfassen
              </button>
            )}
`
if(!content.includes('setShowMergeModal(true)')) {
  content = content.replace(bulkCustomsBtn, bulkCustomsBtn + mergeBtn)
}

// 4. Merge action handler
const handlers = `
  const handleMergeProducts = async (masterId: string, sourceId: string) => {
    const result = await mergeProductsAction(masterId, sourceId)
    if (!result.success) throw new Error(result.error)
    // Deselect and refresh
    setSelectedIds([])
    setShowMergeModal(false)
  }
`
if(!content.includes('handleMergeProducts')) {
  content = content.replace("const handleBulkCustomsSave = async (", handlers + "\n  const handleBulkCustomsSave = async (")
}

// 5. Merge modal component
const modalComponent = `
// --- Merge Products Modal ---
function MergeProductsModal({
  isOpen,
  onClose,
  productsToMerge,
  onMerge
}: {
  isOpen: boolean
  onClose: () => void
  productsToMerge: any[]
  onMerge: (masterId: string, sourceId: string) => Promise<void>
}) {
  const [masterId, setMasterId] = React.useState<string>('')
  const [isMerging, setIsMerging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (isOpen && productsToMerge.length === 2) {
      setMasterId(productsToMerge[0].id)
      setError(null)
    }
  }, [isOpen, productsToMerge])

  if (!isOpen || productsToMerge.length !== 2) return null

  const handleConfirm = async () => {
    if (!masterId) return
    setIsMerging(true)
    setError(null)
    try {
      const sourceId = productsToMerge.find(p => p.id !== masterId)!.id
      await onMerge(masterId, sourceId)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsMerging(false)
    }
  }

  const p1 = productsToMerge[0]
  const p2 = productsToMerge[1]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
              <GitMerge className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Produkte zusammenfassen</h2>
              <p className="text-sm text-slate-500">Wähle das Hauptprodukt aus. Das andere Produkt wird in dieses integriert.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <strong>Achtung:</strong> Alle Marktplatz-Verknüpfungen des zweiten Produkts werden auf das Hauptprodukt übertragen. Der Lagerbestand wird addiert. Das zweite Produkt wird gelöscht. Diese Aktion kann nicht rückgängig gemacht werden!
          </div>

          <div className="space-y-4">
            <label className="text-sm font-semibold text-slate-700">Welches Produkt soll das Hauptprodukt sein?</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {[p1, p2].map(p => (
                <div 
                  key={p.id}
                  onClick={() => setMasterId(p.id)}
                  className={\`relative p-4 rounded-xl border-2 cursor-pointer transition-all \${masterId === p.id ? 'border-purple-500 bg-purple-50/50' : 'border-slate-200 hover:border-purple-200 bg-white'}\`}
                >
                  {masterId === p.id && (
                    <div className="absolute top-3 right-3 text-purple-600">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  )}
                  <div className="text-xs font-bold text-slate-500 mb-1">{p.sku}</div>
                  <div className="font-semibold text-slate-800 line-clamp-2 leading-tight mb-3 pr-6">{p.title}</div>
                  
                  <div className="space-y-2 text-sm text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Bestand:</span>
                      <span className="font-medium">{p.currentStock || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">EAN:</span>
                      <span className="font-medium">{p.ean || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Preis:</span>
                      <span className="font-medium">{p.price ? \`\${p.price} €\` : '-'}</span>
                    </div>
                  </div>
                </div>
              ))}

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-slate-50">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors"
          >
            Abbrechen
          </button>
          <button 
            onClick={handleConfirm}
            disabled={!masterId || isMerging}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm shadow-purple-600/20"
          >
            {isMerging && <Loader2 className="w-4 h-4 animate-spin" />}
            Zusammenfassen
          </button>
        </div>
      </div>
    </div>
  )
}
`

if(!content.includes('MergeProductsModal')) {
  content = content + "\n" + modalComponent
}

// 6. Modal instantiation
const modalInst = `
      <MergeProductsModal
        isOpen={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        productsToMerge={products.filter(p => selectedIds.includes(p.id))}
        onMerge={handleMergeProducts}
      />
`
if(!content.includes('showMergeModal}')) {
  content = content.replace("{/* Modals */}", "{/* Modals */}\n" + modalInst)
}

fs.writeFileSync(file, content)

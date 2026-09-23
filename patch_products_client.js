const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/app/(dashboard)/products/products-client.tsx')
let content = fs.readFileSync(file, 'utf8')

// 1. Add states
const stateCode = `
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [bulkStock, setBulkStock] = useState('')
  const [bulkPrice, setBulkPrice] = useState('')
  const [isBulkEditing, setIsBulkEditing] = useState(false)

  const handleBulkEditSubmit = async () => {
    setIsBulkEditing(true)
    try {
      const { bulkUpdateStockAndPrice } = await import('@/app/actions/products')
      
      const newStock = bulkStock.trim() !== '' ? Math.max(0, parseInt(bulkStock)) : undefined
      let newPrice: number | undefined
      if (bulkPrice.trim() !== '') {
        const parsed = parseFloat(bulkPrice.replace(',', '.'))
        if (!isNaN(parsed)) newPrice = Math.max(0, parsed)
      }

      if (newStock === undefined && newPrice === undefined) {
        showToast('Keine Änderungen eingegeben', 'info')
        setIsBulkEditing(false)
        return
      }

      await bulkUpdateStockAndPrice(Array.from(selectedProductIds), newStock, newPrice)
      setSelectedProductIds(new Set())
      setShowBulkEditModal(false)
      setBulkStock('')
      setBulkPrice('')
      showToast('Bestand/Preis erfolgreich für ausgewählte Produkte aktualisiert', 'success')
      router.refresh()
    } catch (e) {
      console.error(e)
      showToast('Fehler beim Aktualisieren der Daten', 'error')
    } finally {
      setIsBulkEditing(false)
    }
  }
`
if (!content.includes('showBulkEditModal')) {
  content = content.replace('const handleBulkCustomsUpdate = async () => {', stateCode + '\n  const handleBulkCustomsUpdate = async () => {')
}

// 2. Add button
const buttonCode = `
            <button
              onClick={() => setShowBulkEditModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-600 hover:bg-cyan-100 transition-colors text-sm font-semibold border border-cyan-200"
            >
              <Package className="w-4 h-4" />
              Bestand/Preis anpassen
            </button>
`
if (!content.includes('Bestand/Preis anpassen')) {
  content = content.replace('Zolldaten setzen\n            </button>', 'Zolldaten setzen\n            </button>' + buttonCode)
}

// 3. Add Modal
const modalCode = `
      {showBulkEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowBulkEditModal(false)}>
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200 relative overflow-hidden text-left" 
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-cyan-100 flex items-center justify-center mb-4">
                <Package className="w-6 h-6 text-cyan-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-xl mb-2">Werte für {selectedProductIds.size} Produkte anpassen</h3>
              <p className="text-slate-500 text-sm mb-6">
                Lass ein Feld leer, wenn du diesen Wert nicht verändern möchtest.
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Neuer Bestand</label>
                  <input 
                    type="number" 
                    min="0"
                    value={bulkStock} 
                    onChange={e => setBulkStock(e.target.value)} 
                    placeholder="z.B. 100" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Neuer Preis (Brutto in €)</label>
                  <input 
                    type="text" 
                    value={bulkPrice} 
                    onChange={e => setBulkPrice(e.target.value)} 
                    placeholder="z.B. 19.90" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all text-slate-900 placeholder:text-slate-500" 
                  />
                </div>
              </div>
            </div>
            
            <div className="p-4 sm:p-6 bg-slate-50 flex flex-col sm:flex-row gap-3 sm:justify-end border-t border-slate-100">
              <button 
                onClick={() => setShowBulkEditModal(false)}
                disabled={isBulkEditing}
                className="px-6 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50 w-full sm:w-auto"
              >
                Abbrechen
              </button>
              <button 
                onClick={handleBulkEditSubmit}
                disabled={isBulkEditing}
                className="px-6 py-2.5 rounded-xl font-semibold bg-cyan-600 text-white hover:bg-cyan-700 transition-colors disabled:opacity-50 shadow-sm flex justify-center items-center gap-2 w-full sm:w-auto"
              >
                {isBulkEditing && <Loader2 className="w-4 h-4 animate-spin" />}
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
`

if (!content.includes('Werte für {selectedProductIds.size} Produkte anpassen')) {
  content = content.replace('{showBulkCustomsModal && (', modalCode + '\n      {showBulkCustomsModal && (')
}

fs.writeFileSync(file, content)
console.log("Patched products-client.tsx")
